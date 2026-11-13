/* 运行中计时器单例（喂奶/睡眠）：状态在视图切换/表单重渲染间保持；localStorage 持久化（PWA 意外关闭可恢复）；
   纪律：计时由 startAt 推算（不靠 setInterval 累加），间隔只负责刷表盘 */
SD.timers = (() => {
  const KEY = 'sd-timers-v1'
  const KINDS = ['feed', 'sleep']
  const STALE_MS = 24 * 3600e3   // 超过 24h 的运行计时视为遗留，静默丢弃

  let state = { feed: null, sleep: null }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (raw && typeof raw === 'object') state = { feed: null, sleep: null, ...raw }
  } catch { /* node/隐私模式无 localStorage 时仅内存态 */ }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* 同上 */ } }

  /** 启动（或覆盖）一种计时；payload 存业务快照（如喂奶侧别、入睡时刻） */
  function start(kind, payload = {}) {
    state[kind] = { startAt: Date.now(), ...payload }
    save()
    return state[kind]
  }

  /** 停止并取出（null 安全）；返回的 t 供调用方落记录 */
  function stop(kind) {
    const t = state[kind]
    state[kind] = null
    save()
    return t
  }

  /** 读取运行中的计时；超过 24h 的遗留项静默清理（now 可注入供测试） */
  function get(kind, now = Date.now()) {
    const t = state[kind]
    if (t && now - t.startAt > STALE_MS) { state[kind] = null; save(); return null }
    return t || null
  }

  /** 已流逝秒数（now 可注入） */
  function elapsed(t, now = Date.now()) {
    return t ? Math.max(0, Math.floor((now - t.startAt) / 1000)) : 0
  }

  /** 运行中的种类列表（首页指示卡用） */
  function any(now = Date.now()) {
    return KINDS.filter(k => get(k, now))
  }

  return { start, stop, get, elapsed, any }
})()
