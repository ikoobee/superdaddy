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
    get state() { return SD.state },
    get child() { return SD.state.children.find(c => c.id === SD.state.activeId) || null },
    addChild({ name, birth, gender }) {
      const c = { id: uid(), name, birth, gender: gender || '' }
      SD.state.children.push(c); SD.state.activeId = c.id; save(); return c
    },
    switchChild(id) { SD.state.activeId = id; save() },
    removeChild(id, confirmText) {
      SD.state.children = SD.state.children.filter(c => c.id !== id)
      SD.state.records = SD.state.records.filter(r => r.childId !== id)
      delete SD.state.vaccineDoneByChild[id]
      if (SD.state.activeId === id) SD.state.activeId = SD.state.children[0]?.id ?? null
      save()
    },
    recordsOf(childId) {
      const id = childId || SD.state.activeId
      return SD.state.records.filter(r => (r.childId || 'c1') === id)
    },
    addRecord(rec) {
      SD.state.records.push({ id: uid(), childId: SD.state.activeId, ...rec })
      save()
    },
    removeRecord(id) { SD.state.records = SD.state.records.filter(r => r.id !== id); save() },
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
    exportJSON() {
      return JSON.stringify({ app: 'superdaddy', version: 2, exportedAt: new Date().toISOString(), data: SD.state }, null, 2)
    },
    importJSON(text) {
      const obj = JSON.parse(text)
      if (!obj || obj.app !== 'superdaddy' || !obj.data) throw new Error('不是 superdaddy 备份文件')
      SD.state = SD.storeMigrate(obj.data)   // 兼容 v1 备份
      save()
    },
    clearAll() { SD.state = SD.storeMigrate(null); localStorage.removeItem(KEY); localStorage.removeItem('superdaddy-v1') },
  }
})()
