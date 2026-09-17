// v0.6 孕期模式纯函数：孕周 / 胎动汇总 / 宫缩 5-1-1
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSD } from './loader.js';

let SD;
before(() => { SD = loadSD(); });

describe('preg: 孕周与倒计时（按预产期推算，标准 280 天）', () => {
  it('预产期当天 = 孕 40 周+0', () => {
    const p = SD.preg.pregParts('2026-09-17', new Date('2026-09-17T10:00:00'));
    assert.equal(p.week, 40); assert.equal(p.day, 0); assert.equal(p.daysLeft, 0);
  });

  it('预产期前 21 天 = 孕 37 周整', () => {
    const p = SD.preg.pregParts('2026-10-08', new Date('2026-09-17T10:00:00'));
    assert.equal(p.week, 37); assert.equal(p.day, 0); assert.equal(p.daysLeft, 21);
  });

  it('非整周：前 30 天 = 孕 35 周+5', () => {
    const p = SD.preg.pregParts('2026-10-17', new Date('2026-09-17T10:00:00'));
    assert.equal(p.week, 35); assert.equal(p.day, 5);
  });

  it('过期妊娠钳制 ≥40 周；早期下限 ≥0', () => {
    assert.equal(SD.preg.pregParts('2026-09-01', new Date('2026-09-17T10:00:00')).week, 42);  // 过期钳到 42 周（引产区间）
    const early = SD.preg.pregParts('2030-01-01', new Date('2026-09-17T10:00:00'));
    assert.ok(early.gaDays >= 0 && early.week >= 0);
  });
});

describe('preg: 胎动计数汇总（10 次法）', () => {
  it('首末时间差即用时分钟', () => {
    const r = SD.preg.kickSummary({ date: '2026-09-17', start: '20:00', end: '20:36', count: 10 });
    assert.equal(r.minutes, 36);
    assert.equal(r.ok, true);   // <60 分钟 = 正常
  });

  it('超 60 分钟标记异常', () => {
    const r = SD.preg.kickSummary({ date: '2026-09-17', start: '20:00', end: '21:30', count: 10 });
    assert.equal(r.minutes, 90);
    assert.equal(r.ok, false);
  });
});

describe('preg: 宫缩 5-1-1 判定（近 1 小时）', () => {
  // 间隔约 4 分钟、持续约 60 秒 × 12 次 = 满足 5-1-1
  const strong = Array.from({ length: 12 }, (_, i) => ({ gap: 4, dur: 60 }));
  // 间隔 10 分钟、持续 35 秒 = 早期假性宫缩
  const early = Array.from({ length: 6 }, () => ({ gap: 10, dur: 35 }));

  it('满足 5-1-1 → 建议出发就医', () => {
    const r = SD.preg.contractionAdvice(strong, new Date('2026-09-17T20:00:00'));
    assert.equal(r.level, 'go');
    assert.match(r.text, /就医|出发|医院/);
  });

  it('间隔长持续时间短 → 观察', () => {
    const r = SD.preg.contractionAdvice(early, new Date('2026-09-17T20:00:00'));
    assert.equal(r.level, 'watch');
  });

  it('样本不足 → 记录观察', () => {
    const r = SD.preg.contractionAdvice([{ gap: 5, dur: 60 }], new Date('2026-09-17T20:00:00'));
    assert.equal(r.level, 'watch');
  });

  it('破水/见红等红旗独立提示', () => {
    const r = SD.preg.contractionAdvice([], new Date('2026-09-17T20:00:00'), { water: true });
    assert.equal(r.level, 'go');
  });
});
