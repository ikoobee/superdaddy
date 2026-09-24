// v0.4 移植功能纯函数测试：任务流转 / 月历网格 / 睡眠洞察
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSD } from './loader.js';

let SD;
before(() => { SD = loadSD(); });

describe('tasks: 家庭任务流转', () => {
  const list = () => [
    { id: 't1', title: '夜奶轮值', who: '奶爸', pri: 'high', status: 'todo' },
    { id: 't2', title: '买尿不湿', who: '妈妈', pri: 'low', status: 'doing' },
  ]

  it('流转 todo→doing→done，done 记录完成日期且再点不变（防误清）', () => {
    let l = SD.tasks.advance(list(), 't1')
    assert.equal(l.find(t => t.id === 't1').status, 'doing')
    l = SD.tasks.advance(l, 't1')
    const done = l.find(t => t.id === 't1')
    assert.equal(done.status, 'done')
    assert.ok(done.doneAt, '应有 doneAt')
    l = SD.tasks.advance(l, 't1')   // done 再点：不变
    assert.equal(l.find(t => t.id === 't1').status, 'done')
    assert.equal(l.length, 2)
  })

  it('清空已完成只移除 done', () => {
    let l = SD.tasks.advance(list(), 't2')   // t2 doing→done
    l = SD.tasks.clearDone(l)
    assert.equal(l.find(t => t.id === 't2'), undefined)
    assert.equal(l.find(t => t.id === 't1').status, 'todo')
  })

  it('优先级循环 高→中→低→高', () => {
    let l = list()
    l = SD.tasks.cyclePri(l, 't1')
    assert.equal(l.find(t => t.id === 't1').pri, 'mid')
    l = SD.tasks.cyclePri(l, 't1')
    assert.equal(l.find(t => t.id === 't1').pri, 'low')
    l = SD.tasks.cyclePri(l, 't1')
    assert.equal(l.find(t => t.id === 't1').pri, 'high')
  })

  it('非目标任务不动', () => {
    const l = SD.tasks.advance(list(), 'tX')
    assert.equal(l.find(t => t.id === 't1').status, 'todo')
  })
})

describe('cal: 月历网格', () => {
  it('2026-09：首格为周一（8-31），共 42 格，含今日标记', () => {
    const cells = SD.cal.monthGrid(2026, 8, '2026-09-15')   // month 0-based
    assert.equal(cells.length, 42)
    assert.equal(cells[0].d, '2026-08-31')
    assert.equal(cells[0].inMonth, false)
    assert.equal(cells.find(c => c.d === '2026-09-15').today, true)
    assert.equal(cells.find(c => c.d === '2026-09-30').inMonth, true)
  })

  it('2027-02（28 天，首日周一）', () => {
    const cells = SD.cal.monthGrid(2027, 1, '2027-02-10')
    assert.equal(cells[0].d, '2027-02-01')
    assert.equal(cells[0].inMonth, true)
    assert.ok(cells.some(c => c.d === '2027-02-28'))
  })
})

describe('features: 睡眠洞察（本周 vs 月龄参考）', () => {
  it('解析参考带并给出均值与分级', () => {
    const days = Array.from({ length: 7 }, () => ({ sleepMin: 15 * 60 }))  // 日均 15h
    const r = SD.features.sleepInsight(days, 1)   // 0-3月 参考 14-17h
    assert.equal(r.refLo, 14 * 60); assert.equal(r.refHi, 17 * 60)
    assert.equal(r.avgMin, 15 * 60)
    assert.equal(r.level, 'ok')
  })

  it('明显低于参考下限 → warn', () => {
    const days = Array.from({ length: 7 }, () => ({ sleepMin: 9 * 60 }))
    const r = SD.features.sleepInsight(days, 1)
    assert.equal(r.level, 'warn')
  })

  it('超出月龄表取末段兜底', () => {
    const r = SD.features.sleepInsight([{ sleepMin: 600 }], 999)
    assert.ok(r.refLo > 0)
  })
})

describe('features: 42 天月子餐定位', () => {
  it('每天都能命中阶段与菜单，1-42 全覆盖无空洞', () => {
    for (let d = 1; d <= 42; d++) {
      const r = SD.features.day42Day(d)
      assert.ok(r.stage && r.stage.key, `第 ${d} 天无阶段`)
      assert.ok(r.menu && r.menu.b && r.menu.l && r.menu.d, `第 ${d} 天菜单不完整`)
    }
  });

  it('阶段边界与越界钳制', () => {
    assert.equal(SD.features.day42Day(1).stage.key, 's1');
    assert.equal(SD.features.day42Day(3).stage.key, 's1');
    assert.equal(SD.features.day42Day(8).stage.key, 's3');
    assert.equal(SD.features.day42Day(42).stage.key, 's6');
    assert.equal(SD.features.day42Day(99).day, 42, '越界钳到 42');
    assert.equal(SD.features.day42Day(-5).day, 1, '越界钳到 1');
  });

  it('菜单在阶段内轮换（相邻天不同套）', () => {
    const a = SD.features.day42Day(8), b = SD.features.day42Day(9)
    assert.notEqual(a.menu.b, b.menu.b)
  });

  it('结构与红线齐全', () => {
    for (const s of SD.DATA.day42.stages) {
      assert.ok(s.label && s.focus, `阶段 ${s.key} 说明不足`)
      assert.ok(SD.DATA.day42.menus[s.key].length >= 6, `阶段 ${s.key} 应 ≥6 套轮换菜单`)
    }
    assert.ok(SD.DATA.day42.care.length >= 3 && SD.DATA.day42.red.length >= 3, '护理要点与红线不足')
    assert.ok(SD.DATA.day42.checklist.length >= 6, '42 天检查清单应含母婴两侧');
  });
});

describe('data: 待产包清单', () => {
  it('五大类齐全且条目可用', () => {
    const cats = SD.DATA.bag.cats
    assert.ok(cats.length >= 4, '应含证件/妈妈/喂养/宝宝等类目')
    for (const c of cats) {
      assert.ok(c.label && c.items.length >= 3, `类目 ${c.key} 条目不足`)
      for (const [k, txt] of c.items) assert.ok(k && txt.length >= 2, `条目 ${k} 不完整`)
    }
    const keys = cats.flatMap(c => c.items.map(i => i[0]))
    assert.equal(new Set(keys).size, keys.length, '条目 key 不应重复')
  });
});
