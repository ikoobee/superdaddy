// F2 端到端加密同步：WebCrypto 纯函数（PBKDF2 + AES-GCM）
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSD } from './loader.js';

let SD;
before(() => { SD = loadSD(); });

const ROOM = 'K7Q2M9XCV4T8B3NL', PASS = 'J6H4K2M9P7Q3R5S8';

describe('sync: 加密 round-trip', () => {
  it('加密后可解密还原（含嵌套状态数据）', async () => {
    const state = {
      version: 2, children: [{ id: 'c1', name: '小宝', birth: '2026-08-15' }],
      records: [{ id: 'r1', type: 'feed', method: 'nurse', date: '2026-11-13', time: '08:00' }],
      family: { members: [{ id: 'm1', name: '妈妈', role: '妈妈' }], selfId: 'm1' },
    }
    const box = await SD.sync.encryptJSON(state, ROOM, PASS)
    assert.equal(typeof box, 'string')
    assert.ok(!box.includes('小宝'))                       // 密文不含明文
    const back = await SD.sync.decryptJSON(box, ROOM, PASS)
    assert.deepEqual(back, state)
  })

  it('错误密钥解密被拒（AES-GCM 校验失败）', async () => {
    const box = await SD.sync.encryptJSON({ a: 1 }, ROOM, PASS)
    await assert.rejects(() => SD.sync.decryptJSON(box, ROOM, 'WRONG-PASS-0000'))
  })

  it('房间码不同（盐不同）同样解不开——房间码错=拿错数据', async () => {
    const box = await SD.sync.encryptJSON({ a: 1 }, ROOM, PASS)
    await assert.rejects(() => SD.sync.decryptJSON(box, 'AAAAAAAAAAAAAAAA', PASS))
  })

  it('大 payload（数百 KB，覆盖分块 base64 路径）round-trip', async () => {
    const big = { records: Array.from({ length: 800 }, (_, i) => ({ id: 'r' + i, type: 'feed', date: '2026-11-13', time: '08:00', note: 'x'.repeat(60) })) }
    const box = await SD.sync.encryptJSON(big, ROOM, PASS)
    assert.ok(box.length > 100000)
    const back = await SD.sync.decryptJSON(box, ROOM, PASS)
    assert.equal(back.records.length, 800)
  })
})

describe('sync: 未推送检测（重开补推）', () => {
  it('有比上次推送更新的记录 → 需要补推', () => {
    const state = { records: [{ updatedAt: '2026-11-14T10:00:00Z' }], deletedIds: [] }
    assert.equal(SD.sync.hasUnpushed(state, new Date('2026-11-14T09:00:00Z').getTime()), true)
    assert.equal(SD.sync.hasUnpushed(state, new Date('2026-11-14T11:00:00Z').getTime()), false)
  })

  it('墓碑（删除）晚于上次推送也触发补推', () => {
    const state = { records: [], deletedIds: [{ id: 'r1', at: '2026-11-14T10:00:00Z' }] }
    assert.equal(SD.sync.hasUnpushed(state, new Date('2026-11-14T09:00:00Z').getTime()), true)
  })

  it('从未推送过（lastPush=0）且有任意带时间戳数据 → 需要补推', () => {
    assert.equal(SD.sync.hasUnpushed({ records: [{ updatedAt: '2026-11-14T10:00:00Z' }], deletedIds: [] }, 0), true)
    assert.equal(SD.sync.hasUnpushed({ records: [], deletedIds: [] }, 0), false)
  })
})

describe('sync: 家庭码生成', () => {
  it('格式：房间码/密钥各 16 位无易混字符；两次生成不同', () => {
    const a = SD.sync.genCode(), b = SD.sync.genCode()
    assert.match(a.room, /^[2-9A-HJ-NP-Z]{16}$/)
    assert.match(a.pass, /^[2-9A-HJ-NP-Z]{16}$/)
    assert.notEqual(a.room, b.room)
    assert.notEqual(a.pass, b.pass)
  })

  it('解析分享串：房间码/密钥 与 空白/冒号分隔均可', () => {
    assert.deepEqual(SD.sync.parseCode(`${ROOM}/${PASS}`), { room: ROOM, pass: PASS })
    assert.deepEqual(SD.sync.parseCode(`${ROOM} ${PASS}`), { room: ROOM, pass: PASS })
    assert.deepEqual(SD.sync.parseCode('短码/也短'), null)
  })
})
