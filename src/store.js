/* 存储层 v2 —— 多孩模型；localStorage 唯一出入口（纯逻辑在 utils/storeMigrate，有测试） */
SD.store = (() => {
  const KEY = 'superdaddy-v2'

  function load() {
    let raw = null
    try { raw = JSON.parse(localStorage.getItem(KEY)) } catch { raw = null }
    if (!raw) { // 兼容 v1 键
      try { raw = JSON.parse(localStorage.getItem('superdaddy-v1')) } catch { raw = null }
    }
    SD.state = SD.storeMigrate(raw)
    return SD.state
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(SD.state)) }
  const uid = () => 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e3)

  return {
    load, save,
    KEY,   // localStorage 键名（多标签页 storage 事件监听用）
    get state() { return SD.state },
    get child() { return SD.state.children.find(c => c.id === SD.state.activeId) || null },
    addChild({ name, birth, due, gender }) {
      const c = { id: uid(), name, birth: birth || null, due: due || null, gender: gender || '' }
      SD.state.children.push(c); SD.state.activeId = c.id; save(); return c
    },
    /** 宝宝出生转正：补生日，孕期记录原样归档保留 */
    registerBirth(id, birth) {
      const c = SD.state.children.find(x => x.id === id)
      if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return false
      c.birth = birth; save(); return true
    },
    switchChild(id) { SD.state.activeId = id; save() },
    removeChild(id, confirmText) {
      const now = new Date().toISOString()
      const dropIds = SD.state.records.filter(r => r.childId === id).map(r => r.id)
      SD.state.children = SD.state.children.filter(c => c.id !== id)
      SD.state.records = SD.state.records.filter(r => r.childId !== id)
      /* 墓碑：记录防复活 + 档案防复活（合并拉取时远端快照不再带回） */
      SD.state.deletedIds = [...(SD.state.deletedIds || []), ...dropIds.map(x => ({ id: x, at: now }))]
      SD.state.removedChildren = [...new Set([...(SD.state.removedChildren || []), id])]
      delete SD.state.vaccineDoneByChild[id]
      if (SD.state.activeId === id) SD.state.activeId = SD.state.children[0]?.id ?? null
      save()
    },
    recordsOf(childId) {
      const id = childId || SD.state.activeId
      return SD.state.records.filter(r => (r.childId || 'c1') === id)
    },
    addRecord(rec) {
      /* 家庭模式署名：by=id（实时联动改名）+ byName=落库时称呼快照（成员被删后仍可显示） */
      const self = SD.state.family?.selfId ? SD.state.family.members.find(m => m.id === SD.state.family.selfId) : null
      SD.state.records.push({
        id: uid(), childId: SD.state.activeId, updatedAt: new Date().toISOString(),
        ...(self ? { by: self.id, byName: self.name } : {}),
        ...rec,
      })
      save()
      SD.sync?.schedulePush?.()   // 云同步开启时防抖自动同步
    },
    removeRecord(id) {
      SD.state.records = SD.state.records.filter(r => r.id !== id)
      /* 墓碑：合并导入时防止对方旧备份复活已删记录（30 天过期） */
      if (id && !(SD.state.deletedIds || []).some(t => t.id === id))
        (SD.state.deletedIds = SD.state.deletedIds || []).push({ id, at: new Date().toISOString() })
      save()
      SD.sync?.schedulePush?.()
    },
    vaccineDone(childId) {
      const id = childId || SD.state.activeId
      return SD.state.vaccineDoneByChild[id] || (SD.state.vaccineDoneByChild[id] = [])
    },
    toggleVaccine(key) {
      const d = this.vaccineDone()
      const i = d.indexOf(key)
      i >= 0 ? d.splice(i, 1) : d.push(key)
      save()
    },
    addEpds(score, q10) {
      SD.state.epdsHistory.push({ date: SD.time.todayStr(), score, q10 })
      save()
    },
    /* 家庭任务（家庭级，不挂 childId） */
    addTask(title, who, pri) {
      SD.state.tasks.push({ id: uid().replace('c', 't'), title, who, pri, status: 'todo', date: SD.time.todayStr() })
      save()
    },
    advanceTask(id) { SD.state.tasks = SD.tasks.advance(SD.state.tasks, id); save() },
    cycleTaskPri(id) { SD.state.tasks = SD.tasks.cyclePri(SD.state.tasks, id); save() },
    clearDoneTasks() { SD.state.tasks = SD.tasks.clearDone(SD.state.tasks); save() },
    removeTask(id) { SD.state.tasks = SD.state.tasks.filter(t => t.id !== id); save() },
    /** A3：记录最近一次备份时间（随状态持久） */
    markBackup() { SD.state.lastBackup = new Date().toISOString(); save() },
    exportJSON() {
      return JSON.stringify({ app: 'superdaddy', version: 2, exportedAt: new Date().toISOString(), data: SD.state }, null, 2)
    },
    importJSON(text) {
      const obj = JSON.parse(text)
      if (!obj || obj.app !== 'superdaddy' || !obj.data) throw new Error('不是 superdaddy 备份文件')
      SD.state = SD.storeMigrate(obj.data)   // 兼容 v1 备份
      save()
    },
    /** F1 家庭合并导入：并集合并（记录 LWW/墓碑/指纹去重），返回统计 */
    importMerge(text) {
      const obj = JSON.parse(text)
      if (!obj || obj.app !== 'superdaddy' || !obj.data) throw new Error('不是 superdaddy 备份文件')
      const { state, stats } = SD.merge.mergeState(SD.state, SD.storeMigrate(obj.data))
      SD.state = state; save()
      return stats
    },
    clearAll() { SD.state = SD.storeMigrate(null); localStorage.removeItem(KEY); localStorage.removeItem('superdaddy-v1') },
  }
})()
