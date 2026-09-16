/* 月历网格：周一开头 42 格（纯函数） */
SD.cal = {
  /**
   * @param year  四位年
   * @param month 0-based 月（Date 习惯）
   * @param today 'YYYY-MM-DD' 用于标记今日
   * @returns [{d:'YYYY-MM-DD', inMonth, today, day}] × 42
   */
  monthGrid(year, month, today) {
    const pad = n => String(n).padStart(2, '0')
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const first = new Date(year, month, 1)
    const start = new Date(first)
    start.setDate(1 - ((first.getDay() + 6) % 7))   // 周一开头
    const cells = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i)
      cells.push({ d: fmt(d), day: d.getDate(), inMonth: d.getMonth() === month, today: fmt(d) === today })
    }
    return cells
  },
}
