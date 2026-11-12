// BA6 喂养计划：月龄参考 + 下次喂养推算 + 提醒偏好默认值
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSD } from './loader.js';

let SD;
before(() => { SD = loadSD(); });

const BIRTH = '2026-08-15';                                  // 至 2026-11-12 ≈ 2.9 月龄 → milk["2"] 段
const NOW = new Date('2026-11-12T11:00:00').getTime();

describe('feedPlan: 待喂养推算', () => {
  it('月龄 2-3 月参考：6 次/120ml/间隔 3h；上次 10:00 → 下次 13:00 状态 wait', () => {
    const fp = SD.feedPlan.feedPlan(BIRTH, NOW, [
      { type: 'feed', method: 'nurse', date: '2026-11-12', time: '10:00', side: 'L', minutes: 15 },
    ]);
    assert.equal(fp.ref.perMl, 120);
    assert.equal(fp.ref.interval, 3);
    assert.equal(fp.ref.times, 6);
    assert.equal(fp.todayCount, 1);
    assert.equal(fp.nextAt, new Date('2026-11-12T13:00:00').getTime());
    assert.equal(fp.remainMin, 120);
    assert.equal(fp.status, 'wait');
  });

  it('还有 ≤15 分钟 → soon；已过时 → due（remainMin 为负）', () => {
    const recs = [{ type: 'feed', method: 'formula', date: '2026-11-12', time: '10:00', ml: 120 }];
    assert.equal(SD.feedPlan.feedPlan(BIRTH, new Date('2026-11-12T12:50:00').getTime(), recs).status, 'soon');
    const due = SD.feedPlan.feedPlan(BIRTH, new Date('2026-11-12T13:10:00').getTime(), recs);
    assert.equal(due.status, 'due');
    assert.equal(due.remainMin, -10);
  });

  it('跨午夜：昨晚 23:00 喂 → 今晨 02:00 到期，今日次数不含昨晚', () => {
    const fp = SD.feedPlan.feedPlan(BIRTH, new Date('2026-11-12T02:30:00').getTime(), [
      { type: 'feed', method: 'nurse', date: '2026-11-11', time: '23:00', side: 'R', minutes: 20 },
    ]);
    assert.equal(fp.nextAt, new Date('2026-11-12T02:00:00').getTime());
    assert.equal(fp.status, 'due');
    assert.equal(fp.todayCount, 0);
  });

  it('无喂养记录 → status none、nextAt null，参考表仍返回', () => {
    const fp = SD.feedPlan.feedPlan(BIRTH, NOW, [
      { type: 'sleep', date: '2026-11-12', start: '09:00', end: '10:00' },
    ]);
    assert.equal(fp.status, 'none');
    assert.equal(fp.nextAt, null);
    assert.equal(fp.ref.times, 6);
    assert.equal(fp.todayCount, 0);
  });

  it('多条记录取最近一条（含旧格式无 method 记录）', () => {
    const fp = SD.feedPlan.feedPlan(BIRTH, NOW, [
      { type: 'feed', date: '2026-11-12', time: '06:30', side: 'L', minutes: 10, ml: 0 },   // 旧格式
      { type: 'feed', method: 'formula', date: '2026-11-12', time: '10:00', ml: 120 },
      { type: 'feed', method: 'nurse', date: '2026-11-12', time: '08:00', side: 'B', minutes: 18 },
    ]);
    assert.equal(fp.lastMs, new Date('2026-11-12T10:00:00').getTime());
    assert.equal(fp.todayCount, 3);
    assert.equal(fp.nextAt, new Date('2026-11-12T13:00:00').getTime());
  });
});

describe('storeMigrate: 喂养提醒偏好默认值', () => {
  it('v2 老状态无偏好字段 → feedRemind=true / feedNotify=false；显式值保留', () => {
    const def = SD.storeMigrate({ version: 2, children: [], records: [] });
    assert.equal(def.feedRemind, true);
    assert.equal(def.feedNotify, false);
    const kept = SD.storeMigrate({ version: 2, children: [], records: [], feedRemind: false, feedNotify: true });
    assert.equal(kept.feedRemind, false);
    assert.equal(kept.feedNotify, true);
  });
});
