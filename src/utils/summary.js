/* 今日记录汇总：纯函数 */
SD.summary = {
  summarizeDay(records, date) {
    const day = (records || []).filter(r => r.date === date)
    const feeds = day.filter(r => r.type === 'feed')
    const sleeps = day.filter(r => r.type === 'sleep')

    const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
    let sleepMinutes = 0
    for (const s of sleeps) {
      let end = toMin(s.end)
      if (end < toMin(s.start)) end += 24 * 60 // 跨午夜：按当日入睡计
      sleepMinutes += end - toMin(s.start)
    }

    return {
      feedCount: feeds.length,
      feedMl: feeds.reduce((a, f) => a + (Number(f.ml) || 0), 0),
      feedMinutes: feeds.reduce((a, f) => a + (Number(f.minutes) || 0), 0),
      sleepMinutes,
      pee: day.filter(r => r.type === 'pee').length,
      poop: day.filter(r => r.type === 'poop').length,
      vitd: day.some(r => r.type === 'vitd'),
    }
  },
}
