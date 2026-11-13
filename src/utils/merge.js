/* F1 家庭模式：备份合并纯函数——记录按 id 并集、冲突 LWW(updatedAt)、墓碑防复活(30 天)、无 id 按内容指纹去重 */
SD.merge = (() => {
  const TOMB_DAYS = 30
  /** 无 id 记录的内容指纹（业务字段排序键化） */
  const fp = r => JSON.stringify([r.type, r.date, r.time ?? null, r.start ?? null, r.end ?? null, r.side ?? null, r.minutes ?? null, r.ml ?? null])

  function mergeState(local, remote) {
    const stats = { recordsAdded: 0, recordsUpdated: 0 }
    const cutoff = Date.now() - TOMB_DAYS * 86400e3

    /* 墓碑并集：过期（<cutoff）丢弃放行复活；无时间戳的保守保留 */
    const tomb = new Map()
    for (const t of [...(local.deletedIds || []), ...(remote.deletedIds || [])]) {
      if (!t || !t.id) continue
      if (!t.at || new Date(t.at).getTime() >= cutoff) tomb.set(t.id, t.at || '')
    }

    /* 记录：本机打底 → 远端并入（新增/更新/墓碑拦截）→ 本机记录也过一遍墓碑（对方删了我还有） */
    const byId = new Map(), byFp = new Map(), out = []
    for (const r of local.records || []) { out.push(r); if (r.id) byId.set(r.id, r); else byFp.set(fp(r), r) }
    for (const r of remote.records || []) {
      if (r.id && tomb.has(r.id)) continue
      if (r.id) {
        const exist = byId.get(r.id)
        if (!exist) { byId.set(r.id, r); out.push(r); stats.recordsAdded++ }
        else if ((r.updatedAt || '') > (exist.updatedAt || '')) { out[out.indexOf(exist)] = r; byId.set(r.id, r); stats.recordsUpdated++ }
      } else if (!byFp.has(fp(r))) { byFp.set(fp(r), r); out.push(r); stats.recordsAdded++ }
    }
    const records = out.filter(r => !r.id || !tomb.has(r.id))

    /* children 并集：同 id 时远端非空字段覆盖（档案改动传播），空值不覆盖 */
    const childMap = new Map()
    for (const c of local.children || []) childMap.set(c.id, c)
    for (const c of remote.children || []) {
      const e = childMap.get(c.id)
      if (!e) childMap.set(c.id, c)
      else childMap.set(c.id, { ...e, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v != null && v !== '')) })
    }

    /* 疫苗按孩子并集（打了就是打了）；EPDS 按日期+分数去重；任务同 id 保本机 */
    const vac = {}
    for (const k of new Set([...Object.keys(local.vaccineDoneByChild || {}), ...Object.keys(remote.vaccineDoneByChild || {})]))
      vac[k] = [...new Set([...(local.vaccineDoneByChild?.[k] || []), ...(remote.vaccineDoneByChild?.[k] || [])])]
    const epdsMap = new Map()
    for (const e of [...(local.epdsHistory || []), ...(remote.epdsHistory || [])]) epdsMap.set(`${e.date}|${e.score}|${e.q10}`, e)
    const taskMap = new Map()
    for (const t of [...(remote.tasks || []), ...(local.tasks || [])]) taskMap.set(t.id, t)

    /* family：selfId 本机私有；members 并集 + 同 id 改名/改角色传播（非空字段覆盖） */
    let family = local.family || null
    if (family && remote.family) {
      const mMap = new Map(family.members.map(m => [m.id, m]))
      for (const m of remote.family.members || []) {
        const e = mMap.get(m.id)
        if (!e) mMap.set(m.id, m)
        else mMap.set(m.id, { ...e, ...Object.fromEntries(Object.entries(m).filter(([, v]) => v != null && v !== '')) })
      }
      family = { ...family, members: [...mMap.values()] }
    }

    /* activeId 设备私有，但必须指向合并后仍存在的孩子：无效/为空时回落到合并结果第一个
       （B 端无宝宝加入同步：children 已并入而 activeId=null 会让界面全空） */
    const children = [...childMap.values()]
    const activeId = children.some(c => c.id === local.activeId) ? local.activeId : (children[0]?.id ?? null)

    return {
      state: {
        ...local,   // lastBackup/feedRemind/sync 等设备字段保留本机
        records, deletedIds: [...tomb.entries()].map(([id, at]) => ({ id, at })),
        children,
        activeId,
        vaccineDoneByChild: vac,
        epdsHistory: [...epdsMap.values()],
        tasks: [...taskMap.values()],
        family,
      },
      stats,
    }
  }

  return { mergeState }
})()
