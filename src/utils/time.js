/* 时间工具：日龄计算（自旧项目迁移；SD 命名空间使 file:// 可用，测试同源加载） */
SD.time = {
  ageParts(birth, today) {
    const b = new Date(birth + 'T00:00:00'), t = today || new Date()
    let y = t.getFullYear() - b.getFullYear(), mo = t.getMonth() - b.getMonth(), d = t.getDate() - b.getDate()
    if (d < 0) { mo--; d += new Date(t.getFullYear(), t.getMonth(), 0).getDate() }
    if (mo < 0) { y--; mo += 12 }
    const days = Math.floor((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - b) / 86400000)
    return { y, mo, d, days, totalMo: y * 12 + mo }
  },
  fmtAge(p) {
    let s = ''
    if (p.y) s += p.y + '岁'
    if (p.mo) s += p.mo + '个月'
    if (!p.y) s += p.d + '天'
    return s
  },
  todayStr() {
    const t = new Date(), pad = n => String(n).padStart(2, '0')
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  },
  nowTime() {
    const t = new Date(), pad = n => String(n).padStart(2, '0')
    return `${pad(t.getHours())}:${pad(t.getMinutes())}`
  },
  fmtClock(sec) {
    const m = Math.floor(sec / 60), s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  },
  clockMinutes(sec) {
    return Math.round(sec / 60)
  },
}
