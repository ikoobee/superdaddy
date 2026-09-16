// v0.3 功能纯函数测试：7 日趋势聚合 / 计时器格式化
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSD } from './loader.js';

let SD;
before(() => { SD = loadSD(); });

describe('trends: 近 7 日聚合', () => {
  const recs = [
    // 9-13：喂2 睡90
    { type: 'feed', date: '2026-09-13', minutes: 10 }, { type: 'feed', date: '2026-09-13', minutes: 20 },
    { type: 'sleep', date: '2026-09-13', start: '10:00', end: '11:30' },
    // 9-14：喂1 睡60
    { type: 'feed', date: '2026-09-14', minutes: 15 },
    { type: 'sleep', date: '2026-09-14', start: '13:00', end: '14:00' },
    // 9-15：喂3
    { type: 'feed', date: '2026-09-15', minutes: 10 }, { type: 'feed', date: '2026-09-15', minutes: 10 }, { type: 'feed', date: '2026-09-15', minutes: 10 },
  ];

  it('返回 7 天序列，无数据日为 0，含跨午夜睡眠', () => {
    const days = SD.trends.last7Days(recs, '2026-09-15')
    assert.equal(days.length, 7)
    assert.equal(days[6].date, '2026-09-15')            // 末位=今天
    assert.equal(days[6].feedCount, 3)
    assert.equal(days[4].date, '2026-09-13')
    assert.equal(days[4].feedCount, 2)
    assert.equal(days[4].sleepMin, 90)
    assert.equal(days[5].feedCount, 1)
    assert.equal(days[0].feedCount, 0)                  // 7 天前无记录
  });

  it('feedMinutes 聚合正确', () => {
    const days = SD.trends.last7Days(recs, '2026-09-15')
    assert.equal(days[6].feedMinutes, 30)
    assert.equal(days[4].feedMinutes, 30)
  });

  it('跨午夜睡眠计入入睡日', () => {
    const recs2 = [{ type: 'sleep', date: '2026-09-14', start: '23:00', end: '01:00' }]
    const days = SD.trends.last7Days(recs2, '2026-09-15')
    assert.equal(days[5].sleepMin, 120)
    assert.equal(days[6].sleepMin, 0)
  });
});

describe('timer: 哺乳计时格式化', () => {
  it('秒数 → mm:ss', () => {
    assert.equal(SD.time.fmtClock(0), '00:00')
    assert.equal(SD.time.fmtClock(65), '01:05')
    assert.equal(SD.time.fmtClock(754), '12:34')
  });

  it('分钟取整用于存储', () => {
    assert.equal(SD.time.clockMinutes(754), 13)   // 进位
    assert.equal(SD.time.clockMinutes(720), 12)
  });
});
