/* superdaddy-sync —— 端到端加密同步的密文中转（零知识）
   只存客户端加密后的密文（AES-256-GCM），服务器无密钥、无法解密。
   协议：GET /r/:room → {at,blob} | 404 空；POST /r/:room {blob} → {ok,at}
   防护：房间码 16 位无易混字符（=KV 键即鉴权）；每房间 10 写/分钟（isolate 级尽力）；密文 ≤2MB；90 天无写自动过期 */
const MAX_BODY = 2 * 1024 * 1024
const TTL_SECONDS = 90 * 86400
const ROOM_RE = /^[2-9A-HJ-NP-Z]{16}$/
const BLOB_RE = /^[A-Za-z0-9+/]{16,}={0,2}\.[A-Za-z0-9+/]{16,}={0,2}$/

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,HEAD,OPTIONS',
  'access-control-allow-headers': 'content-type',
}

const hits = new Map()   // 写限流窗口计数（isolate 内尽力而为，KV 无需精确）

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    const m = url.pathname.match(/^\/r\/([2-9A-HJ-NP-Z]{16})$/)
    if (!m) return new Response('not found', { status: 404, headers: CORS })
    const room = m[1]

    if (request.method === 'GET' || request.method === 'HEAD') {
      const val = await env.KV.get(room)
      if (!val) return new Response('empty room', { status: 404, headers: CORS })
      const { at, blob } = JSON.parse(val)
      return new Response(JSON.stringify({ at, blob }), { headers: { ...CORS, 'content-type': 'application/json' } })
    }

    if (request.method === 'POST') {
      const win = Math.floor(Date.now() / 60000)
      const key = room + ':' + win
      const n = (hits.get(key) || 0) + 1
      hits.set(key, n)
      if (hits.size > 5000) { for (const k of hits.keys()) if (!k.endsWith(':' + win) && !k.endsWith(':' + (win - 1))) hits.delete(k) }
      if (n > 10) return new Response('rate limited', { status: 429, headers: CORS })

      const body = await request.text()
      if (body.length > MAX_BODY) return new Response('payload too large', { status: 413, headers: CORS })
      let blob = null
      try { blob = JSON.parse(body).blob } catch { /* fallthrough */ }
      if (typeof blob !== 'string' || !BLOB_RE.test(blob)) return new Response('bad blob', { status: 400, headers: CORS })

      const at = new Date().toISOString()
      await env.KV.put(room, JSON.stringify({ at, blob }), { expirationTtl: TTL_SECONDS })
      return new Response(JSON.stringify({ ok: true, at }), { headers: { ...CORS, 'content-type': 'application/json' } })
    }

    return new Response('method not allowed', { status: 405, headers: CORS })
  },
}
