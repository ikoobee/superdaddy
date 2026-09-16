// 核心纯函数测试 —— 经典脚本经 loader 同源加载（与浏览器完全一致的代码路径）
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSD } from './loader.js';

let SD, ageParts, fmtAge, scheduleFor, nextVaccine, summarizeDay;
before(() => {
  SD = loadSD();
  ({ ageParts, fmtAge } = SD.time);
  ({ scheduleFor, nextVaccine } = SD.vaccine);
  ({ summarizeDay } = SD.summary);
});

describe('time: 日龄计算', () => {
  it('同日出生 = 0 天', () => {
    const p = ageParts('2026-09-15', new Date('2026-09-15T10:00:00'));
    assert.equal(p.days, 0);
    assert.equal(p.y, 0); assert.equal(p.mo, 0);
  });

  it('跨月借位：8-31 生，9-30 查 → 30 天', () => {
    const p = ageParts('2026-08-31', new Date('2026-09-30T10:00:00'));
    assert.equal(p.days, 30);
  });

  it('整月：6-15 生，9-15 查 → 3 个月 0 天', () => {
    const p = ageParts('2026-06-15', new Date('2026-09-15T10:00:00'));
    assert.equal(p.mo, 3); assert.equal(p.d, 0); assert.equal(p.totalMo, 3);
  });

  it('fmtAge 输出人类可读', () => {
    assert.match(fmtAge({ y: 0, mo: 3, d: 5 }), /3个月5天/);
    assert.match(fmtAge({ y: 1, mo: 2, d: 0 }), /1岁2个月/);
  });
});

describe('vaccine: 疫苗排程', () => {
  const T = new Date('2026-09-15T10:00:00');

  it('出生即种类（ageM=0）到龄即 overdue（未标记时）', () => {
    const list = scheduleFor('2026-09-13', [], T);
    const birthDose = list.find(v => v.ageM === 0);
    assert.ok(birthDose, '字典应含出生剂');
    assert.equal(birthDose.status, 'overdue');
  });

  it('已种标记覆盖 overdue（null 入参也健壮）', () => {
    const list = scheduleFor('2026-09-13', null, T);
    const key0 = list.find(v => v.ageM === 0);
    const done = scheduleFor('2026-09-13', [`${key0.name}|${key0.dose}`], T);
    assert.equal(done.find(v => v.ageM === 0).status, 'done');
  });

  it('未到龄为 planned，且按排期日排序', () => {
    const list = scheduleFor('2026-09-13', [], T);
    assert.ok(list.some(v => v.status === 'planned'));
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i - 1].sched <= list[i].sched, '应升序');
    }
  });

  it('nextVaccine 返回第一个 planned', () => {
    const n = nextVaccine('2026-09-13', [], T);
    assert.ok(n); assert.equal(n.status, 'planned');
  });
});

describe('summary: 今日汇总', () => {
  const recs = [
    { type: 'feed',  date: '2026-09-15', time: '02:10', side: 'L', minutes: 15, ml: 0 },
    { type: 'feed',  date: '2026-09-15', time: '05:30', side: 'R', minutes: 12, ml: 60 },
    { type: 'sleep', date: '2026-09-15', start: '07:00', end: '08:30' },
    { type: 'sleep', date: '2026-09-15', start: '12:00', end: '13:45' },
    { type: 'pee',   date: '2026-09-15', time: '09:00' },
    { type: 'poop',  date: '2026-09-15', time: '09:05' },
    { type: 'vitd',  date: '2026-09-15', time: '08:00' },
    { type: 'feed',  date: '2026-09-14', time: '23:00', side: 'L', minutes: 10, ml: 0 }, // 昨日不计
  ];

  it('汇总四类：喂奶次数/总量、睡眠分钟、尿便、补剂', () => {
    const s = summarizeDay(recs, '2026-09-15');
    assert.equal(s.feedCount, 2);
    assert.equal(s.feedMl, 60);
    assert.equal(s.feedMinutes, 27);
    assert.equal(s.sleepMinutes, 195); // 90 + 105
    assert.equal(s.pee, 1);
    assert.equal(s.poop, 1);
    assert.equal(s.vitd, true);
  });

  it('空记录返回零值而非崩溃', () => {
    const s = summarizeDay([], '2026-09-15');
    assert.equal(s.feedCount, 0);
    assert.equal(s.sleepMinutes, 0);
    assert.equal(s.vitd, false);
  });

  it('跨午夜睡眠（start>end）计入当日', () => {
    const s = summarizeDay([
      { type: 'sleep', date: '2026-09-15', start: '23:00', end: '01:30' },
    ], '2026-09-15');
    assert.equal(s.sleepMinutes, 150);
  });
});

describe('data: 字典健全性', () => {
  it('疫苗字典结构完整且含出生剂', () => {
    assert.ok(Array.isArray(SD.DATA.vaccine) && SD.DATA.vaccine.length > 5);
    assert.ok(SD.DATA.vaccine.some(v => v.doses.some(d => d.ageM === 0)));
    for (const v of SD.DATA.vaccine) {
      assert.ok(v.name && Array.isArray(v.doses) && v.doses.length > 0, `条目缺字段: ${v.name}`);
    }
  });
});
