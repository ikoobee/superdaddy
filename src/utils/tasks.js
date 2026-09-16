/* 家庭任务：三态流转（done 落停并记完成日期）+ 优先级循环 + 清理已完成 */
SD.tasks = {
  /** todo→doing→done（记录 doneAt）；done 状态点击不再变化（防误清） */
  advance(list, id) {
    return list.map(t => {
      if (t.id !== id) return t
      if (t.status === 'todo') return { ...t, status: 'doing' }
      if (t.status === 'doing') return { ...t, status: 'done', doneAt: SD.time.todayStr() }
      return t
    })
  },
  /** 点优先级徽标循环：高→中→低→高 */
  cyclePri(list, id) {
    const ORD = ['high', 'mid', 'low']
    return list.map(t => t.id === id ? { ...t, pri: ORD[(ORD.indexOf(t.pri) + 1) % 3] } : t)
  },
  /** 清空已完成 */
  clearDone(list) { return list.filter(t => t.status !== 'done') },
}
