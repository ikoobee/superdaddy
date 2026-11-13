// 计时器单例：视图切换不丢、应用重开可恢复（BA19）
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSD } from './loader.js';

let SD;
before(() => { SD = loadSD(); });

describe('timers: 运行中计时跨视图保持', () => {
  it('start 存档（含业务负载）→ stop 取出并清空', () => {
    SD.timers.start('sleep', { startStr: '21:00', startDate: '2026-11-13' })
    const t = SD.timers.get('sleep')
    assert.equal(t.startStr, '21:00')
    assert.equal(t.startDate, '2026-11-13')
    const done = SD.timers.stop('sleep')
    assert.equal(done.startStr, '21:00')
    assert.equal(SD.timers.get('sleep'), null)
  })

  it('elapsed 按 startAt 推算秒数（可注入 now，供测试）', () => {
    SD.timers.start('feed', { side: 'L' })
    const t = SD.timers.get('feed')
    assert.equal(SD.timers.elapsed(t, t.startAt + 65e3), 65)
    assert.equal(SD.timers.elapsed(t, t.startAt + 90e3), 90)
    SD.timers.stop('feed')
  })

  it('超过 24h 的遗留计时在 get 时丢弃（应用重开的极端场景）', () => {
    SD.timers.start('sleep', {})
    const t = SD.timers.get('sleep')
    assert.ok(t)
    assert.equal(SD.timers.get('sleep', t.startAt + 25 * 3600e3), null)
    assert.equal(SD.timers.get('sleep'), null)   // 已被清理
  })

  it('any() 列出运行中的计时种类', () => {
    SD.timers.start('sleep', {})
    assert.deepEqual(SD.timers.any(), ['sleep'])
    SD.timers.start('feed', { side: 'L' })
    assert.ok(SD.timers.any().includes('feed'))
    SD.timers.stop('sleep'); SD.timers.stop('feed')
    assert.deepEqual(SD.timers.any(), [])
  })
})
