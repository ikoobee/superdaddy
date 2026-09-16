/* 局域网静态服务器 —— 零依赖（Node 内置），手机访问用
 * 用法：npm run serve   →  手机浏览器打开 http://<本机IP>:8181
 * 说明：http 局域网非安全上下文，SW 不注册（不影响使用），「添加到主屏」仍可用
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8181
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0])
  if (p === '/') p = '/index.html'
  const file = path.join(ROOT, p)
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found') }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
    res.end(data)
  })
})

server.listen(PORT, () => {
  const nets = os.networkInterfaces()
  const ips = Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address)
  console.log('超级奶爸工作台 已启动：')
  console.log('  本机：  http://localhost:' + PORT)
  for (const ip of ips) console.log('  手机：  http://' + ip + ':' + PORT + '   （同一 Wi-Fi 下访问）')
  if (!ips.length) console.log('  （未发现局域网 IP，请检查网络）')
})
