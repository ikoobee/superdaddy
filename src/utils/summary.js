/* 今日记录汇总：纯函数 */
/* 喂养方式判定：新记录带 method（nurse 亲喂 / formula 奶粉）；旧记录无 method 按 ml 推断（>0=奶粉，否则亲喂） */
const feedMethod = f => f.method || (Number(f.ml) > 0 ? 'formula' : 'nurse')

SD.summary = {
  feedMethod,

  /**
   * 记录人显示名（时间轴徽标）：
   * 实时成员名（改名联动）→ 记录时快照 byName（成员被删后显示当时称呼）→ '家人'（极老孤儿署名，替换问号）。
   * 未署名（旧数据/单人模式）返回 null = 不显示。
   */
  authorName(r, family) {
    if (!family || !r.by) return null
    const m = (family.members || []).find(x => x.id === r.by)
    return m ? m.name : (r.byName || '家人')
  },

  /** 本设备此前创建过的成员（deviceId 匹配）——重新加入同一家庭时复用身份，防止成员堆积 */
  ownMember(family, deviceId) {
    if (!family || !deviceId) return null
    return (family.members || []).find(m => m.deviceId === deviceId) || null
  },

  /**
   * 认领未署名记录（开启家庭/加入家庭/切换身份时）：by 为空的历史记录归入指定成员。
   * onlyIds（可选）：只认领集合内的 id——加入端用它限定「首同步前本机已有」的记录，防止误领家人同步来的。
   * 就地修改（records 是状态对象）；他人已署名的不动；返回认领条数。
   */
  claimUnsigned(records, member, onlyIds = null) {
    let n = 0
    for (const r of records || []) {
      if (r.by) continue
      if (onlyIds && !onlyIds.has(r.id)) continue
      r.by = member.id; r.byName = member.name; n++
    }
    return n
  },

  /**
   * 历史署名归集（创建者维护动作）：把「未署名」与「显示为家人」（孤儿且无快照）的记录归入指定成员；
   * 有效署名与称呼快照（如已删成员「奶奶」）保留。返回归集条数。
   */
  claimOrphans(records, family, member) {
    let n = 0
    for (const r of records || []) {
      const an = SD.summary.authorName(r, family)
      if (an === null || an === '家人') { r.by = member.id; r.byName = member.name; n++ }
    }
    return n
  },

  /**
   * 宝宝档案合并（加入家庭时发现两边各建了一份同一宝宝）：dropId 并入 keepId（以家人档案为准）。
   * 就地修改 state：记录 childId 重映射、疫苗并集、删除重复档、activeId 修复；返回重映射条数。
   */
  mergeChildren(state, keepId, dropId) {
    let remapped = 0
    for (const r of state.records || []) {
      if (r.childId === dropId) { r.childId = keepId; remapped++ }
    }
    state.children = (state.children || []).filter(c => c.id !== dropId)
    const vac = (state.vaccineDoneByChild = state.vaccineDoneByChild || {})
    if (vac[dropId]) {
      vac[keepId] = [...new Set([...(vac[keepId] || []), ...vac[dropId]])]
      delete vac[dropId]
    }
    if (state.activeId === dropId) state.activeId = keepId
    return { remapped }
  },

  /**
   * 丢弃本机宝宝档（加入家庭时选择「只留家人数据」）：删档 + 删其记录（写墓碑防合并复活）+ 清疫苗 + activeId 修复。
   * 就地修改 state；返回删除的记录条数。
   */
  discardChild(state, childId) {
    const now = new Date().toISOString()
    const dropIds = new Set()
    let removed = 0
    state.records = (state.records || []).filter(r => {
      if (r.childId === childId) { dropIds.add(r.id); removed++; return false }
      return true
    })
    state.deletedIds = [...(state.deletedIds || []), ...[...dropIds].map(id => ({ id, at: now }))]
    state.children = (state.children || []).filter(c => c.id !== childId)
    state.removedChildren = [...new Set([...(state.removedChildren || []), childId])]   // 档案墓碑：防合并复活
    const vac = (state.vaccineDoneByChild = state.vaccineDoneByChild || {})
    delete vac[childId]
    if (state.activeId === childId) state.activeId = state.children[0]?.id ?? null
    return { removed }
  },

  /** 单段睡眠分钟数：跨午夜（end < start）按入睡日 +24h；同时刻 = 0 */
  sleepMin(start, end) {
    const toMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m }
    let e = toMin(end)
    if (e < toMin(start)) e += 24 * 60
    return e - toMin(start)
  },

  summarizeDay(records, date) {
    const day = (records || []).filter(r => r.date === date)
    const feeds = day.filter(r => r.type === 'feed')
    const sleeps = day.filter(r => r.type === 'sleep')

    const sleepMinutes = sleeps.reduce((a, s) => a + SD.summary.sleepMin(s.start, s.end), 0)

    return {
      feedCount: feeds.length,
      feedMl: feeds.reduce((a, f) => a + (Number(f.ml) || 0), 0),
      feedMinutes: feeds.reduce((a, f) => a + (Number(f.minutes) || 0), 0),
      nurseCount: feeds.filter(f => feedMethod(f) === 'nurse').length,
      formulaCount: feeds.filter(f => feedMethod(f) === 'formula').length,
      formulaMl: feeds.filter(f => feedMethod(f) === 'formula').reduce((a, f) => a + (Number(f.ml) || 0), 0),
      sleepMinutes,
      pee: day.filter(r => r.type === 'pee').length,
      poop: day.filter(r => r.type === 'poop').length,
      vitd: day.some(r => r.type === 'vitd'),
    }
  },

  /**
   * 记录页时间轴分组：日期倒序取最近 n 天；日内按记录时间倒序（time，睡眠用 start）。
   * 补录早时点记录落到时间位置而非录入位置；无时间字段排该日末尾。
   * 相同时间的平局用确定性键（id / 内容指纹）——合并后各端数组顺序不同，展示顺序必须一致。
   */
  timelineDays(records, n) {
    const recs = records || []
    const tie = r => r.id || `${r.type}|${r.time || ''}|${r.start || ''}|${r.minutes ?? ''}|${r.ml ?? ''}`
    const days = [...new Set(recs.map(r => r.date))].filter(Boolean).sort().reverse().slice(0, n)
    return days.map(date => {
      const items = recs
        .filter(r => r.date === date)
        .map(r => ({ r, k: r.time || r.start || '', t: tie(r) }))
        .sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : (a.t < b.t ? 1 : a.t > b.t ? -1 : 0)))
        .map(x => x.r)
      return { date, items }
    })
  },
}
