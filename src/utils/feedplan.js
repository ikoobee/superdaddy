/* BA6 喂养计划：按月龄参考表（feed.data.js milk）推算推荐量/间隔与下次喂养时间（纯函数，TDD） */
SD.feedPlan = (() => {
  /** 记录 → 时间戳：date=YYYY-MM-DD + time=HH:MM（缺 time 按当日 00:00） */
  const recMs = r => new Date(`${r.date}T${r.time || '00:00'}:00`).getTime()

  /** 最近一次喂养记录（任意方式；旧格式无 method 一样参与） */
  function lastFeed(records) {
    const feeds = (records || []).filter(r => r.type === 'feed' && r.date)
    return feeds.length ? feeds.reduce((a, b) => (recMs(b) > recMs(a) ? b : a)) : null
  }

  /**
   * feedPlan(birth, nowMs, records)
   * → { ref, last, lastMs, nextAt, remainMin, status, todayCount }
   *   ref        milkRef 段：{ times, perMl, interval, note, ... }
   *   nextAt     上次喂养 + interval 小时（无记录为 null）
   *   remainMin  距下次分钟数（已过为负；无记录 null）
   *   status     none 无记录 | wait 未到 | soon ≤15min | due 已到
   *   todayCount 今日喂养次数（不含昨日跨午夜条目）
   */
  function feedPlan(birth, nowMs, records) {
    const now = new Date(nowMs)
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const ref = SD.features.milkRef(SD.time.ageParts(birth, now).totalMo)
    const todayCount = (records || []).filter(r => r.type === 'feed' && r.date === today).length
    const last = lastFeed(records)
    if (!last) return { ref, last: null, lastMs: null, nextAt: null, remainMin: null, status: 'none', todayCount }

    const lastMs = recMs(last)
    const nextAt = lastMs + ref.interval * 3600e3
    const remainMin = Math.ceil((nextAt - nowMs) / 60000)
    const status = remainMin <= 0 ? 'due' : remainMin <= 15 ? 'soon' : 'wait'
    return { ref, last, lastMs, nextAt, remainMin, status, todayCount }
  }

  return { feedPlan, lastFeed }
})()
