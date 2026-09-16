// v0.2 功能纯函数测试
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSD } from './loader.js';

let SD;
before(() => { SD = loadSD(); });

describe('growth: WHO 百分位', () => {
  it('已知月龄返回 5 条百分位线（插值）', () => {
    const p = SD.growth.pcts('weight', 'm', 1);
    assert.equal(p.length, 5);
    assert.ok(p[0] < p[2] && p[2] < p[4], 'P3<P50<P97');
  });

  it('非整数月龄线性插值（0.5 月介于 0 与 1 月之间）', () => {
    const p0 = SD.growth.pcts('weight', 'm', 0), p1 = SD.growth.pcts('weight', 'm', 1);
    const ph = SD.growth.pcts('weight', 'm', 0.5);
    assert.ok(p0[2] < ph[2] && ph[2] < p1[2]);
  });

  it('中位数值 → 约 P50；远低于 P3 → 最低档', () => {
    const p50 = SD.growth.pcts('weight', 'm', 3)[2];
    assert.ok(Math.abs(SD.growth.percentileNum('weight', 'm', 3, p50) - 50) <= 2);
    assert.ok(SD.growth.percentileNum('weight', 'm', 3, 1.0) < 10);
  });

  it('evalDesc 分档正确', () => {
    const p = SD.growth.pcts('weight', 'm', 3);
    assert.equal(SD.growth.evalDesc('weight', 'm', 3, p[0] + 0.01).rating, 'warn'); // P3-P15 区间下沿=中下
    assert.equal(SD.growth.evalDesc('weight', 'm', 3, p[4] + 1).rating, 'crit');   // >P97
  });

  it('bmi 与遗传靶身高', () => {
    assert.equal(SD.growth.bmi(10, 100), 10.0);
    assert.equal(SD.growth.targetHeight(180, 160).boy, 176.5);
    assert.equal(SD.growth.targetHeight(180, 160).girl, 163.5);
  });
});

describe('features: 指南月龄定位', () => {
  it('7 个月命中 6 月段；0-1 月命中对应段', () => {
    assert.ok(SD.features.guideSection(7).title.includes('6'));
    assert.ok(SD.features.guideSection(0).title.includes('0'));
  });

  it('月龄超过最大段取末段', () => {
    const s = SD.features.guideSection(999);
    assert.ok(s, '应有兜底段');
  });
});

describe('features: EPDS 计分', () => {
  it('全 0 → 0 分低危；q10>0 触发红旗', () => {
    const r = SD.features.epdsScore([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(r.total, 0); assert.equal(r.level, 'low'); assert.equal(r.q10Flag, false);
  });

  it('≥13 高危；q10 任一分即红旗', () => {
    const r = SD.features.epdsScore([3, 3, 3, 3, 3, 1, 0, 0, 0, 1]);
    assert.equal(r.total, 17); assert.equal(r.level, 'high'); assert.equal(r.q10Flag, true);
  });

  it('9-12 分中危', () => {
    const r = SD.features.epdsScore([1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    assert.equal(r.level, 'mid');
  });
});

describe('features: 辅食观察窗（3 天法）', () => {
  it('第 1/2/3 天与观察期结束', () => {
    assert.equal(SD.features.foodWindow('2026-09-15', '2026-09-15').day, 1);
    assert.equal(SD.features.foodWindow('2026-09-15', '2026-09-17').day, 3);
    assert.equal(SD.features.foodWindow('2026-09-15', '2026-09-15').passed, false);
    assert.equal(SD.features.foodWindow('2026-09-15', '2026-09-18').passed, true);
  });
});

describe('features: 体温分级', () => {
  it('四档分级 + 3 月龄内 ≥38 紧急', () => {
    assert.equal(SD.features.tempStatus(6, 36.8), 'ok');
    assert.equal(SD.features.tempStatus(6, 37.5), 'low');
    assert.equal(SD.features.tempStatus(6, 38.6), 'high');
    assert.equal(SD.features.tempStatus(2, 38.1), 'urgent');
    assert.equal(SD.features.tempStatus(6, 38.1), 'low');
  });
});

describe('features: 奶量参考', () => {
  it('按月龄给出每日次数与每次量（含间隔与日总量）', () => {
    const r = SD.features.milkRef(2);
    assert.ok(r.times >= 5 && r.times <= 8);
    assert.ok(r.perMl > 60);
    assert.ok(r.interval >= 2, '应含小时间隔（旧版瓦片第 3 项）');
    assert.ok(r.note);
    assert.equal(r.perDay, r.times * r.perMl, '日总量=次数×每次量');
  });
});

describe('store v2: 多孩数据模型与迁移', () => {
  it('v1 单孩状态自动迁移为 v2', () => {
    const s = SD.storeMigrate({ child: { name: '小柿子', birth: '2026-08-01', gender: 'f' }, records: [{ type: 'pee', date: '2026-09-15' }], vaccineDone: ['乙肝|1'] });
    assert.equal(s.version, 2);
    assert.equal(s.children.length, 1);
    assert.equal(s.children[0].name, '小柿子');
    assert.ok(s.records[0].childId, '记录应带 childId');
    assert.deepEqual(s.vaccineDoneByChild[s.activeId], ['乙肝|1']);
  });

  it('空状态生成空 v2', () => {
    const s = SD.storeMigrate(null);
    assert.equal(s.version, 2);
    assert.deepEqual(s.children, []);
  });
});
