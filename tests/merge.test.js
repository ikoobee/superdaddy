// F1 家庭模式：备份合并纯函数（mergeState）
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSD } from './loader.js';

let SD;
before(() => { SD = loadSD(); });

const base = () => ({
  version: 2, children: [{ id: 'c1', name: 'A', birth: '2026-08-15' }], activeId: 'c1',
  records: [], vaccineDoneByChild: {}, epdsHistory: [], tasks: [],
})

describe('merge: 记录合并', () => {
  it('并集 + 同 id 冲突取 updatedAt 新者', () => {
    const local = { ...base(), records: [
      { id: 'r1', type: 'feed', date: '2026-11-13', time: '08:00', updatedAt: '2026-11-13T08:00:00Z' },
      { id: 'r2', type: 'pee', date: '2026-11-13', time: '09:00', updatedAt: '2026-11-13T09:00:00Z' },
    ] }
    const remote = { ...base(), records: [
      { id: 'r2', type: 'pee', date: '2026-11-13', time: '09:00', updatedAt: '2026-11-13T10:00:00Z' },  // 更新版本
      { id: 'r3', type: 'sleep', date: '2026-11-13', start: '12:00', end: '13:00', updatedAt: '2026-11-13T13:00:00Z' },
    ] }
    const { state, stats } = SD.merge.mergeState(local, remote)
    assert.deepEqual(state.records.map(r => r.id).sort(), ['r1', 'r2', 'r3'])
    assert.equal(state.records.find(r => r.id === 'r2').updatedAt, '2026-11-13T10:00:00Z')
    assert.equal(stats.recordsAdded, 1)
    assert.equal(stats.recordsUpdated, 1)
  })

  it('墓碑拦截复活（远端带回已删记录不入）；30 天过期墓碑放行且被清理', () => {
    const now = new Date().toISOString()
    const stale = new Date(Date.now() - 31 * 86400e3).toISOString()
    const local = { ...base(), records: [{ id: 'mine', type: 'pee', date: '2026-11-13', updatedAt: now }],
      deletedIds: [{ id: 'dead-stale', at: stale }, { id: 'dead-live', at: now }, { id: 'mine', at: now }] }
    const remote = { ...base(), records: [
      { id: 'dead-stale', type: 'pee', date: '2026-11-13', updatedAt: now },  // 墓碑过期 → 允许复活
      { id: 'dead-live', type: 'pee', date: '2026-11-13', updatedAt: now },   // 墓碑有效 → 拦截
    ] }
    const { state } = SD.merge.mergeState(local, remote)
    assert.ok(state.records.some(r => r.id === 'dead-stale'))
    assert.ok(!state.records.some(r => r.id === 'dead-live'))
    assert.ok(!state.records.some(r => r.id === 'mine'))                          // 本机记录命中远端墓碑 → 删除
    assert.ok(!state.deletedIds.some(t => t.id === 'dead-stale'))                 // 过期墓碑被清
    assert.ok(state.deletedIds.some(t => t.id === 'dead-live'))                   // 有效墓碑保留
  })

  it('无 id 记录按内容指纹去重', () => {
    const local = { ...base(), records: [{ type: 'feed', date: '2026-11-13', time: '08:00', side: 'L' }] }
    const remote = { ...base(), records: [
      { type: 'feed', date: '2026-11-13', time: '08:00', side: 'L' },   // 同内容 → 去重
      { type: 'pee', date: '2026-11-13', time: '09:00' },               // 新内容 → 并入
    ] }
    const { state, stats } = SD.merge.mergeState(local, remote)
    assert.equal(state.records.length, 2)
    assert.equal(stats.recordsAdded, 1)
  })
})

describe('merge: 集合并集与设备私有字段', () => {
  it('children/vaccine/epds 并集；family.selfId 本机保留，members 并集传播', () => {
    const local = {
      version: 2, activeId: 'c1', lastBackup: 'local-keep',
      children: [{ id: 'c1', name: 'A', birth: '2026-08-15' }],
      records: [], vaccineDoneByChild: { c1: ['hbv1'] },
      epdsHistory: [{ date: '2026-11-01', score: 3, q10: 0 }], tasks: [],
      family: { members: [{ id: 'm1', name: '妈妈', role: '妈妈' }], selfId: 'm1' },
    }
    const remote = {
      version: 2, activeId: 'c2', lastBackup: 'remote-drop',
      children: [{ id: 'c1', name: 'A', birth: '2026-08-15' }, { id: 'c2', name: 'B', birth: '2027-01-01' }],
      records: [], vaccineDoneByChild: { c1: ['hbv1', 'bcg1'] },
      epdsHistory: [{ date: '2026-11-01', score: 3, q10: 0 }, { date: '2026-11-10', score: 5, q10: 0 }], tasks: [],
      family: { members: [{ id: 'm1', name: '妈妈', role: '妈妈' }, { id: 'm2', name: '爸爸', role: '爸爸' }], selfId: 'm2' },
    }
    const { state } = SD.merge.mergeState(local, remote)
    assert.deepEqual(state.children.map(c => c.id).sort(), ['c1', 'c2'])
    assert.deepEqual([...state.vaccineDoneByChild.c1].sort(), ['bcg1', 'hbv1'])
    assert.equal(state.epdsHistory.length, 2)                       // 同日同分去重
    assert.equal(state.family.selfId, 'm1')                         // 本机身份不动
    assert.equal(state.family.members.length, 2)                    // 远端新增成员传播进来
    assert.equal(state.lastBackup, 'local-keep')                    // 设备私有字段保留本机
  })

  it('children 同 id：远端非空字段覆盖（对方改了档案）；tasks 同 id 保本机', () => {
    const local = { ...base(), children: [{ id: 'c1', name: 'A', birth: '2026-08-15' }],
      tasks: [{ id: 't1', title: '买奶粉', status: 'todo' }] }
    const remote = { ...base(), children: [{ id: 'c1', name: '小A', birth: null }],
      tasks: [{ id: 't1', title: '买奶粉', status: 'done' }] }
    const { state } = SD.merge.mergeState(local, remote)
    assert.equal(state.children[0].name, '小A')                     // 远端改名传播
    assert.equal(state.children[0].birth, '2026-08-15')             // 远端空值不覆盖
    assert.equal(state.tasks.find(t => t.id === 't1').status, 'todo')  // 任务冲突保本机
  })

  it('老状态迁移补 family/deletedIds 默认', () => {
    const s = SD.storeMigrate({ version: 2, children: [], records: [] })
    assert.equal(s.family, null)
    assert.deepEqual(s.deletedIds, [])
  })

  it('旧家庭（无 localIds）自举：当前 selfId 视为本机身份', () => {
    const s = SD.storeMigrate({ version: 2, children: [], records: [], family: { members: [{ id: 'm1', name: '妈妈' }, { id: 'm2', name: '爸爸' }], selfId: 'm2' } })
    assert.deepEqual(s.family.localIds, ['m2'])
  })

  it('members 同 id：远端改名/改角色传播（非空字段覆盖）', () => {
    const local = { ...base(), family: { members: [{ id: 'm1', name: '妈妈', role: '妈妈' }, { id: 'm2', name: '爸爸', role: '爸爸' }], selfId: 'm1' } }
    const remote = { ...base(), family: { members: [{ id: 'm1', name: '妈咪', role: '其他' }, { id: 'm3', name: '奶奶', role: '奶奶' }], selfId: 'm3' } }
    const { state } = SD.merge.mergeState(local, remote)
    const m1 = state.family.members.find(m => m.id === 'm1')
    assert.equal(m1.name, '妈咪')                                  // 改名传播
    assert.equal(m1.role, '其他')                                   // 角色更新传播
    assert.equal(state.family.members.length, 3)                    // 并集
    assert.equal(state.family.selfId, 'm1')                         // 本机身份不动
  })

  it('成员 LWW：本机改名时间戳更新 → 远端旧名不回滚（刷新竞态）', () => {
    const local = { ...base(), family: { members: [{ id: 'm1', name: '新名', role: '妈妈', renamedAt: '2026-11-14T12:00:00Z' }], selfId: 'm1' } }
    const remote = { ...base(), family: { members: [{ id: 'm1', name: '旧名', role: '妈妈', renamedAt: '2026-11-14T11:00:00Z' }], selfId: 'm1' } }
    const { state } = SD.merge.mergeState(local, remote)
    assert.equal(state.family.members.find(m => m.id === 'm1').name, '新名')
  })

  it('成员 LWW：远端改名时间戳更新 → 远端新名传播到本机', () => {
    const local = { ...base(), family: { members: [{ id: 'm1', name: '旧名', renamedAt: '2026-11-14T11:00:00Z' }], selfId: 'm1' } }
    const remote = { ...base(), family: { members: [{ id: 'm1', name: '新名', renamedAt: '2026-11-14T12:00:00Z' }], selfId: 'm1' } }
    const { state } = SD.merge.mergeState(local, remote)
    assert.equal(state.family.members.find(m => m.id === 'm1').name, '新名')
  })

  it('成员移除墓碑传播：创建者删的成员在加入设备上消失，removedMembers 并集', () => {
    const local = { ...base(), family: { members: [{ id: 'm1', name: '妈妈' }, { id: 'm2', name: '奶奶' }], selfId: 'm1', creator: true, localIds: ['m1'] } }
    const remote = { ...base(), family: { members: [{ id: 'm1', name: '妈妈' }, { id: 'm2', name: '奶奶' }], selfId: 'm2', creator: false, localIds: ['m2'], removedMembers: ['m2'] } }
    const { state } = SD.merge.mergeState(local, remote)
    assert.deepEqual(state.family.members.map(m => m.id), ['m1'])       // m2 被移除传播
    assert.ok(state.family.removedMembers.includes('m2'))
  })

  it('本机身份被移除后：selfId 回落到本机仍存的身份；localIds 清理', () => {
    const local = { ...base(), family: { members: [{ id: 'm1', name: '妈妈' }, { id: 'm2', name: '奶奶' }], selfId: 'm2', creator: false, localIds: ['m2'] } }
    const remote = { ...base(), family: { members: [{ id: 'm1', name: '妈妈' }], selfId: 'm1', creator: true, localIds: ['m1'], removedMembers: ['m2'] } }
    const { state } = SD.merge.mergeState(local, remote)
    assert.deepEqual(state.family.members.map(m => m.id), ['m1'])
    assert.equal(state.family.selfId, null)   // 本机唯一身份被移除：置空（引导重新设身份），不冒认他人身份
    assert.deepEqual(state.family.localIds, [])
  })

  it('本机未开家庭而远端有：采纳远端成员名单，设备字段归零（加入流程先同步后设身份）', () => {
    const local = { ...base(), family: null }
    const remote = { ...base(), family: { members: [{ id: 'm1', name: '妈妈', deviceId: 'dA' }, { id: 'm2', name: '爸爸', deviceId: 'dB' }], selfId: 'm1', creator: true, localIds: ['m1'] } }
    const { state } = SD.merge.mergeState(local, remote)
    assert.equal(state.family.members.length, 2)      // 名单采纳
    assert.equal(state.family.selfId, null)           // 设备字段归零，待本机设置
    assert.equal(state.family.creator, false)
    assert.deepEqual(state.family.localIds, [])
  })

  it('ownMember：按 deviceId 找回本机旧身份（重新加入复用，不新建）', () => {
    const family = { members: [{ id: 'm2', name: '爸爸', deviceId: 'dB' }, { id: 'm1', name: '妈妈', deviceId: 'dA' }] }
    assert.equal(SD.summary.ownMember(family, 'dA')?.id, 'm1')
    assert.equal(SD.summary.ownMember(family, 'dZ'), null)
  })

  it('合并后修复 activeId：本机从未有宝宝（null）→ 取合并结果第一个孩子（B 端加入同步场景）', () => {
    const local = { ...base(), children: [], activeId: null }        // 无痕新站：从未建宝宝
    const remote = { ...base() }                                      // A 端：c1 + activeId c1
    const { state } = SD.merge.mergeState(local, remote)
    assert.equal(state.children.length, 1)
    assert.equal(state.activeId, 'c1')
  })

  it('activeId 指向合并后已不存在的孩子 → 回落到现存第一个', () => {
    const local = { ...base(), activeId: 'cGone' }                    // 指向已被对方删掉的孩子
    const remote = { ...base(), children: [{ id: 'cX', name: 'B', birth: '2027-01-01' }] }
    const { state } = SD.merge.mergeState(local, remote)
    assert.equal(state.activeId, 'c1')                                // 本机孩子仍在 → 保本机选中
    const local2 = { ...base(), children: [], activeId: 'cGone' }
    const { state: s2 } = SD.merge.mergeState(local2, remote)
    assert.equal(s2.activeId, 'cX')                                   // 本机无孩子 → 取远端孩子
  })
})
