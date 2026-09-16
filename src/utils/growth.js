/* 成长计算：WHO 百分位 / BMI / 遗传靶身高（自旧项目移植，SD 化 + 性别适配 m/f|男/女） */
SD.growth = (() => {
  const PC = ['p3', 'p15', 'p50', 'p85', 'p97']
  const gKey = g => (g === 'f' || g === '女' ? 'girl' : 'boy')

  /** 线性插值：{月龄:[P3,P15,P50,P85,P97]} → 任意月龄的百分位线值 */
  function pcts(metric, gender, month) {
    const map = SD.DATA.who[metric][gKey(gender)]
    const ms = Object.keys(map).map(Number).sort((a, b) => a - b)
    if (month <= ms[0]) return map[ms[0]]
    if (month >= ms[ms.length - 1]) return map[ms[ms.length - 1]]
    for (let i = 0; i < ms.length - 1; i++) {
      if (ms[i] <= month && month <= ms[i + 1]) {
        const r = (month - ms[i]) / (ms[i + 1] - ms[i]), a = map[ms[i]], b = map[ms[i + 1]]
        return PC.map((_, j) => Math.round((a[j] + (b[j] - a[j]) * r) * 10) / 10)
      }
    }
    return map[ms[ms.length - 1]]
  }

  /** 数值 → 百分位整数（线性插值） */
  function percentileNum(metric, gender, month, value) {
    const p = pcts(metric, gender, month)
    const b = [[3, p[0]], [15, p[1]], [50, p[2]], [85, p[3]], [97, p[4]]]
    for (let i = 0; i < b.length - 1; i++) {
      if (value >= b[i][1] && value <= b[i + 1][1]) {
        const r = (value - b[i][1]) / (b[i + 1][1] - b[i][1])
        return Math.round(b[i][0] + r * (b[i + 1][0] - b[i][0]))
      }
    }
    return value < p[0] ? 3 : 97
  }

  /** 文字评估 */
  function evalDesc(metric, gender, month, value) {
    const p = pcts(metric, gender, month)
    if (value < p[0]) return { desc: '偏低 <P3', rating: 'crit' }
    if (value < p[1]) return { desc: '中下 P3-15', rating: 'warn' }
    if (value < p[2]) return { desc: '中等偏下', rating: 'ok' }
    if (value < p[3]) return { desc: '中等偏上', rating: 'ok' }
    if (value < p[4]) return { desc: '中上 P85-97', rating: 'warn' }
    return { desc: '偏高 >P97', rating: 'crit' }
  }

  function bmi(kg, cm) {
    return kg && cm ? Math.round((kg / Math.pow(cm / 100, 2)) * 10) / 10 : null
  }

  /** 遗传靶身高（中华医学会公式） */
  function targetHeight(dadCm, momCm) {
    return { boy: (dadCm + momCm + 13) / 2, girl: (dadCm + momCm - 13) / 2 }
  }

  return { pcts, percentileNum, evalDesc, bmi, targetHeight }
})()
