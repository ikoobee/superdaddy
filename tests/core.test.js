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

  it('喂养分口径：新记录带 method 时按亲喂/奶粉分别计数', () => {
    const s = summarizeDay([
      { type: 'feed', date: '2026-09-15', time: '02:00', method: 'nurse',   side: 'L', minutes: 15 },
      { type: 'feed', date: '2026-09-15', time: '05:00', method: 'formula', ml: 120 },
      { type: 'feed', date: '2026-09-15', time: '08:00', method: 'formula', ml: 90 },
    ], '2026-09-15');
    assert.equal(s.feedCount, 3);
    assert.equal(s.nurseCount, 1);
    assert.equal(s.formulaCount, 2);
    assert.equal(s.formulaMl, 210);
  });

  it('旧记录无 method：ml>0 推断为奶粉，否则亲喂', () => {
    const s = summarizeDay(recs, '2026-09-15'); // 夹具两条今日 feed 均无 method：15min/0ml 与 12min/60ml
    assert.equal(s.nurseCount, 1);
    assert.equal(s.formulaCount, 1);
    assert.equal(s.formulaMl, 60);
  });

  it('discardChild：丢弃本机宝宝档——删记录+写墓碑+清疫苗+activeId 修复', () => {
    const state = {
      children: [{ id: 'cR', name: '小宝', birth: '2026-08-15' }, { id: 'cX', name: '测试', birth: '2026-11-01' }],
      activeId: 'cX',
      records: [
        { id: 'r1', childId: 'cX', type: 'feed' },
        { id: 'r2', childId: 'cR', type: 'sleep' },
      ],
      vaccineDoneByChild: { cR: ['hbv1'], cX: ['bcg1'] },
      deletedIds: [],
    }
    const { removed } = SD.summary.discardChild(state, 'cX')
    assert.equal(removed, 1)
    assert.deepEqual(state.children.map(c => c.id), ['cR'])
    assert.deepEqual(state.records.map(r => r.id), ['r2'])            // 本机档记录删除
    assert.ok(state.deletedIds.some(t => t.id === 'r1'))              // 墓碑防复活
    assert.equal(state.vaccineDoneByChild.cX, undefined)
    assert.equal(state.activeId, 'cR')
  })

  it('跨午夜睡眠（start>end）计入当日', () => {
    const s = summarizeDay([
      { type: 'sleep', date: '2026-09-15', start: '23:00', end: '01:30' },
    ], '2026-09-15');
    assert.equal(s.sleepMinutes, 150);
  });
  it('sleepMin：常规 / 跨午夜 / 同时刻=0', () => {
    assert.equal(SD.summary.sleepMin('12:00', '13:45'), 105);
    assert.equal(SD.summary.sleepMin('23:00', '01:30'), 150); // 跨午夜按入睡日 +24h
    assert.equal(SD.summary.sleepMin('09:00', '09:00'), 0);
  });
  it('claimUnsigned：认领无署名记录（by+byName），已有署名不动，返回条数', () => {
    const member = { id: 'm1', name: '妈妈' }
    const recs = [
      { type: 'pee', date: '2026-11-14' },                                  // 未署名 → 认领
      { type: 'feed', date: '2026-11-14', by: 'm2', byName: '奶奶' },        // 他人署名 → 不动
      { type: 'sleep', date: '2026-11-14' },                                // 未署名 → 认领
    ]
    const n = SD.summary.claimUnsigned(recs, member)
    assert.equal(n, 2)
    assert.deepEqual(recs[0], { type: 'pee', date: '2026-11-14', by: 'm1', byName: '妈妈' })
    assert.equal(recs[1].by, 'm2')
    assert.equal(recs[2].by, 'm1')
  })

  it('mergeChildren：本机宝宝并入家人宝宝——记录重映射/疫苗并集/删档/activeId 修复', () => {
    const state = {
      children: [{ id: 'cKeep', name: '小宝', birth: '2026-08-15' }, { id: 'cDrop', name: '宝宝', birth: '2026-11-01' }],
      activeId: 'cDrop',
      records: [
        { id: 'r1', childId: 'cDrop', type: 'feed' },
        { id: 'r2', childId: 'cKeep', type: 'sleep' },
      ],
      vaccineDoneByChild: { cKeep: ['hbv1'], cDrop: ['bcg1', 'hbv1'] },
    }
    const { remapped } = SD.summary.mergeChildren(state, 'cKeep', 'cDrop')
    assert.equal(remapped, 1)
    assert.deepEqual(state.children.map(c => c.id), ['cKeep'])          // 重复档删除，家人档案为准
    assert.equal(state.records.find(r => r.id === 'r1').childId, 'cKeep')
    assert.deepEqual([...state.vaccineDoneByChild.cKeep].sort(), ['bcg1', 'hbv1'])
    assert.equal(state.vaccineDoneByChild.cDrop, undefined)
    assert.equal(state.activeId, 'cKeep')
  })

  describe('记录人显示（authorName）', () => {
    const fam = { members: [{ id: 'm1', name: '妈妈' }, { id: 'm2', name: '爸爸' }], selfId: 'm1' }
    it('未署名或未开家庭 → null（不显示徽标）', () => {
      assert.equal(SD.summary.authorName({ type: 'pee' }, fam), null)
      assert.equal(SD.summary.authorName({ type: 'pee', by: 'm1' }, null), null)
    })
    it('实时联动：成员改名后历史记录显示最新称呼', () => {
      assert.equal(SD.summary.authorName({ by: 'm1' }, fam), '妈妈')
      const renamed = { ...fam, members: [{ id: 'm1', name: '妈咪' }] }
      assert.equal(SD.summary.authorName({ by: 'm1' }, renamed), '妈咪')
    })
    it('成员已删：回退记录时快照 byName；无快照兜底「家人」（替换问号）', () => {
      assert.equal(SD.summary.authorName({ by: 'gone', byName: '奶奶' }, fam), '奶奶')
      assert.equal(SD.summary.authorName({ by: 'gone' }, fam), '家人')
    })
  });
});

describe('summary: 时间轴分组排序', () => {
  it('日内按记录时间倒序——补录的早时点记录落到对应位置（非录入顺序）', () => {
    const t = SD.summary.timelineDays([
      { type: 'feed',  date: '2026-09-15', time: '10:00' },
      { type: 'sleep', date: '2026-09-15', start: '12:00', end: '13:00' },  // 睡眠用 start
      { type: 'pee',   date: '2026-09-15', time: '06:30' },                 // 后录入但时间最早
    ], 5)
    assert.equal(t.length, 1)
    assert.deepEqual(t[0].items.map(r => r.type), ['sleep', 'feed', 'pee'])
  })

  it('相同时间的记录顺序与数组位置无关（跨设备合并后展示一致）', () => {
    const a = { id: 'rX1', type: 'pee',  date: '2026-09-15', time: '10:00' }
    const b = { id: 'rX2', type: 'feed', date: '2026-09-15', time: '10:00' }
    const t1 = SD.summary.timelineDays([a, b], 5)[0].items.map(r => r.id)
    const t2 = SD.summary.timelineDays([b, a], 5)[0].items.map(r => r.id)
    assert.deepEqual(t1, t2)
  })

  it('多日：日期倒序分组只取最近 n 天；无时间字段排该日末尾', () => {
    const t = SD.summary.timelineDays([
      { type: 'feed',  date: '2026-09-14', time: '23:00' },
      { type: 'diary', date: '2026-09-15' },                                // 无 time/start
      { type: 'feed',  date: '2026-09-15', time: '08:00' },
      { type: 'feed',  date: '2026-09-13', time: '09:00' },                 // 超出 n=2 被截断
    ], 2)
    assert.deepEqual(t.map(d => d.date), ['2026-09-15', '2026-09-14'])
    assert.deepEqual(t[0].items.map(r => r.type), ['feed', 'diary'])
    assert.equal(t.length, 2)
  })
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
