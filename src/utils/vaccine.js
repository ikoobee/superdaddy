/* 疫苗排程：按生日 + 字典计算全程计划（自旧项目迁移） */
SD.vaccine = {
  /**
   * @param birth 'YYYY-MM-DD'
   * @param doneKeys ['麻腮风|1', ...]
   * @returns [{name,dose,ageM,sched:'YYYY-MM-DD',status: done|planned|overdue,free}]
   */
  scheduleFor(birth, doneKeys, today) {
    const done = doneKeys || []
    const t = today || new Date()
    const b = new Date(birth + 'T00:00:00')
    const ageMo = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth())
    const list = []
    SD.DATA.vaccine.forEach(v => v.doses.forEach(d => {
      const sched = new Date(b); sched.setMonth(sched.getMonth() + d.ageM)
      const key = `${v.name}|${d.d}`
      let status = 'planned'
      if (ageMo >= d.ageM) status = 'overdue'      // 到龄未种 → 待补（可被 done 覆盖）
      if (done.includes(key)) status = 'done'
      const pad = n => String(n).padStart(2, '0')
      list.push({
        name: v.name, dose: d.d, ageM: d.ageM, free: v.free,
        sched: `${sched.getFullYear()}-${pad(sched.getMonth() + 1)}-${pad(sched.getDate())}`,
        status
      })
    }))
    list.sort((a, b2) => a.sched < b2.sched ? -1 : 1)
    return list
  },
  nextVaccine(birth, doneKeys, today) {
    return SD.vaccine.scheduleFor(birth, doneKeys, today).find(v => v.status === 'planned') || null
  },
}
