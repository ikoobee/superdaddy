/* 今日记录汇总：纯函数 */
/* 喂养方式判定：新记录带 method（nurse 亲喂 / formula 奶粉）；旧记录无 method 按 ml 推断（>0=奶粉，否则亲喂） */
const feedMethod = f => f.method || (Number(f.ml) > 0 ? 'formula' : 'nurse')

SD.summary = {
  feedMethod,

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
   * 补录早时点记录落到时间位置而非录入位置；无时间字段排该日末尾；同时间保持录入顺序。
   */
  timelineDays(records, n) {
    const recs = records || []
    const days = [...new Set(recs.map(r => r.date))].filter(Boolean).sort().reverse().slice(0, n)
    return days.map(date => {
      const items = recs
        .filter(r => r.date === date)
        .map((r, i) => ({ r, i, k: r.time || r.start || '' }))
        .sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : a.i - b.i))
        .map(x => x.r)
      return { date, items }
    })
  },
}
