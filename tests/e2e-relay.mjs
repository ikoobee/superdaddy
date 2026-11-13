/* F2 真实中转 E2E：应用加密模块 → 推送 → 拉取 → 解密 → 比对（node 18+，需网络）
   用法：node tests/e2e-relay.mjs  ——冒烟专用，不进 npm test（依赖外部服务） */
import { loadSD } from './loader.js'

const SD = loadSD()
const ROOM = 'E2ETEST9K2M7XQ4C'   // 16 位专用测试房间
const code = { room: ROOM, pass: SD.sync.genCode().pass }

const state = {
  version: 2, children: [{ id: 'c1', name: 'E2E宝宝', birth: '2026-08-15' }],
  records: Array.from({ length: 50 }, (_, i) => ({ id: 'r' + i, type: 'feed', method: i % 2 ? 'nurse' : 'formula', date: '2026-11-13', time: '08:00', updatedAt: new Date().toISOString() })),
  family: { members: [{ id: 'm1', name: '妈妈', role: '妈妈' }], selfId: 'm1' },
}

const U = 'https://superdaddy-sync.ikoobee.com/r/' + ROOM

// 1. 加密并推送
const blob = await SD.sync.encryptJSON(state, code.room, code.pass)
console.log('1. 加密后长度:', blob.length, '（明文子串泄漏:', blob.includes('E2E宝宝') + '）')
const pushRes = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blob }) })
console.log('2. 推送:', pushRes.status, JSON.stringify(await pushRes.json()))

// 2. 拉取并解密
const getRes = await fetch(U)
const { at, blob: back } = await getRes.json()
console.log('3. 拉取:', getRes.status, 'at=', at, '密文一致:', back === blob)

const restored = await SD.sync.decryptJSON(back, code.room, code.pass)
console.log('4. 解密还原: 记录数', restored.records.length, '/ 孩子名', restored.children[0].name,
  '/ 深度相等:', JSON.stringify(restored) === JSON.stringify(state))

// 3. 错误密钥必须被拒
let rejected = false
try { await SD.sync.decryptJSON(back, code.room, 'X'.repeat(16)) } catch { rejected = true }
console.log('5. 错误密钥被拒:', rejected)

// 4. 清理测试房间（覆盖为最小合法密文，KV 无 delete API——90 天 TTL 自动过期）
const clear = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blob: await SD.sync.encryptJSON({ cleared: true }, code.room, code.pass) }) })
console.log('6. 测试房间覆盖清理:', clear.status)
