/* v0.2 功能纯函数：指南定位 / EPDS 计分 / 辅食观察窗 / 体温分级 / 奶量参考 / 多孩迁移 */
SD.features = (() => {
  const dayDiff = (a, b) => Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)

  return {
    /** 指南段定位：月龄 → 不大于它的最近阈值段 */
    guideSection(month) {
      const keys = Object.keys(SD.DATA.guide).map(Number).filter(Number.isFinite).sort((a, b) => b - a)
      const k = keys.find(x => x <= month) ?? keys[keys.length - 1]
      return SD.DATA.guide[k]
    },

    /** EPDS 爱丁堡产后抑郁量表（简化自评，非诊断）：answers 为 10 题 0-3 分 */
    epdsScore(answers) {
      const total = answers.reduce((a, x) => a + (Number(x) || 0), 0)
      const q10 = Number(answers[9]) || 0
      return {
        total,
        q10Flag: q10 > 0,
        level: total >= 13 ? 'high' : total >= 9 ? 'mid' : 'low',
      }
    },

    /** 辅食 3 天观察窗：第几天 / 是否已出窗 */
    foodWindow(start, today) {
      const d = dayDiff(start, today) + 1
      return { day: Math.min(Math.max(d, 1), 3), passed: d > 3 }
    },

    /** 体温分级：<3 月龄 ≥38 紧急；≥38.5 高热；≥37.3 低热 */
    tempStatus(monthsAge, val) {
      if (val == null || Number.isNaN(Number(val))) return 'ok'
      const v = Number(val)
      if (monthsAge < 3 && v >= 38) return 'urgent'
      if (v >= 38.5) return 'high'
      if (v >= 37.3) return 'low'
      return 'ok'
    },

    /** 奶量参考：feed.milk[month] = [每日次数, 每次ml, 小时间隔, 说明] */
    milkRef(month) {
      const m = SD.DATA.feed.milk
      const keys = Object.keys(m).map(Number).sort((a, b) => b - a)
      const k = keys.find(x => x <= month) ?? keys[keys.length - 1]
      const [times, perMl, interval, note] = m[k]
      return { month: k, times, perMl, interval, note, perDay: times * perMl }
    },

    /** 睡眠洞察：近 7 日均值 vs 月龄参考带（"14-17h" 解析） */
    sleepInsight(days7, monthAge) {
      const band = SD.DATA.sleep_ref.find(b => monthAge >= b.min && monthAge <= b.max)
        ?? SD.DATA.sleep_ref[SD.DATA.sleep_ref.length - 1]
      const [lo, hi] = (band.total.match(/(\d+)-(\d+)h/) || [0, 13, 16]).slice(1).map(Number)
      const refLo = lo * 60, refHi = hi * 60
      const vals = days7.map(d => d.sleepMin)
      const avgMin = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
      const level = avgMin < refLo * 0.8 || avgMin > refHi * 1.2 ? 'warn' : 'ok'
      return { band, refLo, refHi, avgMin, level }
    },

    /** 42 天月子餐：按天数定位阶段与轮换菜单（1-42，越界钳制） */
    day42Day(day) {
      const d = Math.min(Math.max(Number(day) || 1, 1), 42)
      const stages = SD.DATA.day42.stages
      const stage = stages.find(s => d >= s.from && d <= s.to) || stages[stages.length - 1]
      const menus = SD.DATA.day42.menus[stage.key]
      const menu = menus[(d - stage.from) % menus.length]
      return { day: d, stage, menu }
    },
  }
})()

/** v1 → v2 状态迁移（纯函数，store 调用）：单孩 → children[] + 按 childId 归档 */
SD.storeMigrate = state => {
  const base = { version: 2, children: [], activeId: null, records: [], vaccineDoneByChild: {}, epdsHistory: [], tasks: [] }
  if (!state) return base
  if (state.version === 2) return { tasks: [], ...state }   // 补默认字段（老 v2 备份）
  // v1: { child, records, vaccineDone }
  const children = state.child ? [{ id: 'c1', ...state.child }] : []
  const activeId = children[0]?.id ?? null
  return {
    ...base,
    children,
    activeId,
    records: (state.records || []).map(r => ({ ...r, childId: r.childId || activeId })),
    vaccineDoneByChild: activeId ? { [activeId]: state.vaccineDone || [] } : {},
  }
}
