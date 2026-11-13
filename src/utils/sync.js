/* F2 端到端加密同步：密钥派生 + 加解密（WebCrypto，浏览器/Node 同构）+ 家庭码 + 中转客户端
   安全模型：明文与密钥永不出设备；中转服务器（Cloudflare Worker+KV）只存密文；房间码=KV 键（不可猜测），密钥=口令派生（永不上送） */
SD.sync = (() => {
  const RELAY = 'https://superdaddy-sync.ikoobee.com'   // 自建可改：部署 sync-worker/ 后替换（workers.dev 域在大陆不可达，用自定义域）
  const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'              // 无 0/1/I/O/L 易混字符
  const enc = new TextEncoder(), dec = new TextDecoder()

  /* 大缓冲分块 base64（避免 spread 栈溢出） */
  const bufToB64 = buf => {
    const u = new Uint8Array(buf); let s = ''
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  }
  const b64ToBuf = str => { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u }

  /** 房间码参与盐（房间码错=派生键错=AES-GCM 解密必失败）；口令永不离开设备 */
  async function deriveKey(room, pass) {
    const mat = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('superdaddy-sync-v1:' + room), iterations: 100000, hash: 'SHA-256' },
      mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  }

  async function encryptJSON(obj, room, pass) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(room, pass), enc.encode(JSON.stringify(obj)))
    return bufToB64(iv) + '.' + bufToB64(ct)
  }

  async function decryptJSON(box, room, pass) {
    const [ivB64, ctB64] = String(box).split('.')
    if (!ivB64 || !ctB64) throw new Error('密文格式不正确')
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(ivB64) }, await deriveKey(room, pass), b64ToBuf(ctB64))
    return JSON.parse(dec.decode(pt))
  }

  const rand = n => { const u = new Uint8Array(n); crypto.getRandomValues(u); return [...u].map(x => ALPHA[x % ALPHA.length]).join('') }
  const genCode = () => ({ room: rand(16), pass: rand(16) })

  /** 解析家人分享的同步码：`房间码/密钥`，容忍空白分隔；不合法返回 null */
  function parseCode(text) {
    const m = String(text || '').trim().match(/^([2-9A-HJ-NP-Z]{16})\s*[\/:：\s]\s*([2-9A-HJ-NP-Z]{16})$/)
    return m ? { room: m[1], pass: m[2] } : null
  }

  /* ── 中转客户端（浏览器侧；同步 = 先拉取合并，再推送合并结果） ── */

  async function pullRemote(room, pass) {
    const res = await fetch(`${RELAY}/r/${room}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`中转服务 ${res.status}`)
    const { at, blob } = await res.json()
    return { at, state: await decryptJSON(blob, room, pass) }
  }

  async function pushState(state, room, pass) {
    const blob = await encryptJSON(state, room, pass)
    const res = await fetch(`${RELAY}/r/${room}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blob }),
    })
    if (!res.ok) throw new Error(`推送失败 ${res.status}`)
    return (await res.json()).at
  }

  /** 一键同步：拉远端 → 本地合并 → 推合并结果。返回统计；网络/解密异常向上抛由 UI 提示 */
  async function syncNow() {
    const cfg = SD.state.sync
    if (!cfg || !cfg.room) throw new Error('未配置家庭同步码')
    let stats = null
    const remote = await pullRemote(cfg.room, cfg.pass)
    if (remote) {
      const merged = SD.merge.mergeState(SD.state, remote.state)
      SD.state = merged.state
      stats = merged.stats
    }
    SD.state.sync.lastPush = await pushState(SD.state, cfg.room, cfg.pass)
    SD.state.sync.lastPull = new Date().toISOString()
    SD.store.save()
    return stats || { recordsAdded: 0, recordsUpdated: 0 }
  }

  /** 启动静默拉取（失败不打扰） */
  async function autoPull() {
    try {
      const cfg = SD.state.sync
      if (!cfg || !cfg.room) return
      const remote = await pullRemote(cfg.room, cfg.pass)
      if (!remote) return
      const merged = SD.merge.mergeState(SD.state, remote.state)
      SD.state = merged.state
      SD.state.sync.lastPull = new Date().toISOString()
      SD.store.save()
      if ((merged.stats.recordsAdded || 0) + (merged.stats.recordsUpdated || 0) > 0) SD.app.render()
    } catch { /* 静默 */ }
  }

  return { encryptJSON, decryptJSON, genCode, parseCode, syncNow, autoPull, RELAY }
})()
