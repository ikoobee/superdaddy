/* 近 7 日趋势聚合：纯函数（复用 summary.summarizeDay 的口径） */
SD.trends = {
  /**
   * @param records 该孩子的记录数组
   * @param today 'YYYY-MM-DD'
   * @returns [{date, feedCount, feedMinutes, feedMl, nurseCount, formulaCount, formulaMl,
   *           nightCount, sleepMin, pee, poop}] 长度 7，末位=今天
   * nightCount：夜奶次数（22:00–05:59 时段内的喂养，含跨午夜凌晨条目按其 date 归日）
   */
  last7Days(records, today) {
    const out = []
    const base = new Date(today + 'T00:00:00')
    const isNight = hm => { const [h] = String(hm || '').split(':').map(Number); return h >= 22 || h < 6 }
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(d.getDate() - i)
      const pad = n => String(n).padStart(2, '0')
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const s = SD.summary.summarizeDay(records, ds)
      const nightCount = (records || []).filter(r => r.type === 'feed' && r.date === ds && isNight(r.time)).length
      out.push({
        date: ds,
        feedCount: s.feedCount, feedMinutes: s.feedMinutes, feedMl: s.feedMl,
        nurseCount: s.nurseCount, formulaCount: s.formulaCount, formulaMl: s.formulaMl,
        nightCount,
        sleepMin: s.sleepMinutes, pee: s.pee, poop: s.poop,
      })
    }
    return out
  },
}
