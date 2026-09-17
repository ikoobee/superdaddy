/* 孕期纯函数：孕周推算 / 胎动汇总 / 宫缩 5-1-1 判定 */
SD.preg = (() => {
  const dayDiff = (a, b) => Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)

  return {
    /**
     * 由预产期反推孕周（标准 280 天孕期）
     * @param due 'YYYY-MM-DD' 预产期
     * @param today Date
     * @returns { week, day, daysLeft, gaDays }（gaDays=孕天数，钳 0..280+）
     */
    pregParts(due, today) {
      const t = today || new Date()
      const tStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
      const daysLeft = dayDiff(tStr, due)                     // >0 未到，<0 已过
      const gaDays = Math.max(0, Math.min(294, 280 - daysLeft)) // 过期钳到 42 周
      return { week: Math.floor(gaDays / 7), day: gaDays % 7, daysLeft: Math.max(0, daysLeft), gaDays }
    },

    /**
     * 胎动计数汇总（10 次法）：2 小时内数满 10 次为正常，>60 分提示关注
     * @param rec { date, start, end, count }
     */
    kickSummary(rec) {
      const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
      let end = toMin(rec.end)
      if (end < toMin(rec.start)) end += 24 * 60
      const minutes = end - toMin(rec.start)
      return { minutes, ok: minutes <= 60, count: rec.count }
    },

    /**
     * 宫缩 5-1-1 判定：近 1 小时间隔 ≤5 分钟、每次 ≥1 分钟、持续 ≥1 小时 → 出发
     * @param list [{gap:分钟, dur:秒}] 近一小时记录
     * @param flags { water?: 破水, bleed?: 见红多 }
     */
    contractionAdvice(list, _now, flags = {}) {
      if (flags.water || flags.bleed) {
        return { level: 'go', text: '破水/大量见红：平躺垫高臀部，立即出发医院（不要走动）' }
      }
      if (!list || list.length < 6) {
        return { level: 'watch', text: '样本还少，继续记录间隔与时长；规律后再看趋势' }
      }
      const avgGap = list.reduce((a, x) => a + x.gap, 0) / list.length
      const avgDur = list.reduce((a, x) => a + x.dur, 0) / list.length
      if (avgGap <= 5 && avgDur >= 60) {
        return { level: 'go', text: `已符合 5-1-1（平均间隔 ${avgGap.toFixed(1)} 分 · 持续 ${Math.round(avgDur)} 秒）——可以出发去医院` }
      }
      return { level: 'watch', text: `平均间隔 ${avgGap.toFixed(1)} 分 · 持续 ${Math.round(avgDur)} 秒：尚未达 5-1-1，休息补水继续观察` }
    },
  }
})()
