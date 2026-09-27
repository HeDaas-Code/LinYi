/**
 * t5 社会/代际/文明反馈接线验收
 *
 * 覆盖三件在修复前**实测为假**的事：
 *   1) 代际身份可查：初代/子代/开国一代的 registry 记录必须带 generation 与 parents。
 *      修复前 registerAgent 只写 { name, persona }，generation/parents 恒为 undefined，
 *      「第几代、父母是谁」只能从 family.lineage 间接推断，重启后完全无从判断。
 *   2) 文明重启真的隔离旧状态：修复前 phase3 调 restart.execute 时恒传 reset=null
 *      （生产代码从不设置 config.restartReset），于是"重启沙盒"没有发生——
 *      同一批居民继续活着、世代号不变、没有下一代。
 *   3) 下一代由居民工厂（genesis.agentFactory.template）**真实创建**，且行为可分叉。
 *      修复前 genesis.agentFactory 在生产路径零调用（assemble 计数恒为 0）。
 *
 * 这些断言都是端到端跑主循环得出的，不依赖对内部实现的 mock。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop } from '../src/runtime/index.js';
import * as registry from '../src/runtime/registry.js';
import * as agent from '../src/agent/index.js';
import * as observer from '../src/observer/index.js';
import * as genesis from '../src/genesis/index.js';

/** 当前活跃居民的 registry 记录。 */
function liveAgents() {
  return registry.lookup({ type: 'agent' });
}

// ---- 1) 代际身份可查 ----

test('t5 代际：初代居民在 registry 里带 generation/bornTick/parents（修复前恒为 undefined）', async () => {
  loop.reset();
  await loop.run({ ticks: 3, seed: 5, agentCount: 4 });

  const ags = liveAgents();
  assert.equal(ags.length, 4, '应有 4 名初代居民');
  for (const a of ags) {
    assert.equal(a.data.generation, 1, '初代世代号应为 1：' + JSON.stringify(a.data));
    assert.equal(a.data.parents, null, '初代没有父母');
    assert.ok(Number.isInteger(a.data.bornTick), '应记录出生 tick');
    assert.equal(a.data.alive, true);
    // 身份面（persona.identity.describe）必须能查到同一个世代号
    assert.equal(agent.persona.identity.describe(a.id).generation, 1,
      '身份面应暴露 generation');
  }
});

test('t5 代际：子代的世代号由真实父母推导（父母 max + 1），不是默认值', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 150, seed: 1, agentCount: 10 });

  const ags = liveAgents();
  const kids = ags.filter((a) => Array.isArray(a.data.parents) && a.data.parents.length === 2);
  assert.ok(kids.length >= 1, 'phase2 运行应产生子代，实际 ' + kids.length);
  assert.ok(new Set(ags.map((a) => a.data.generation)).size >= 2,
    '应出现多代：' + JSON.stringify([...new Set(ags.map((a) => a.data.generation))]));

  for (const kid of kids) {
    const parentGens = kid.data.parents
      .map((p) => registry.lookup(p)?.data?.generation)
      .filter((g) => Number.isInteger(g));
    assert.equal(parentGens.length, 2, '子代的父母都应仍在 registry 里：' + JSON.stringify(kid.data.parents));
    assert.equal(kid.data.generation, Math.max(...parentGens) + 1,
      '子代世代号必须 = 父母最大世代 + 1（id=' + kid.id + '）');
  }
});

// ---- 2) 重启隔离旧状态 ----

test('t5 重启隔离：崩溃交接后旧世代全部封存、新世代接管（旧 id 不再活跃）', async () => {
  loop.reset();
  const report = await loop.run({
    phase3: true, ticks: 6, seed: 3, agentCount: 3, collapseForce: true,
  });

  const summary = report.phase3.summary;
  assert.equal(summary.collapses, 1, '应发生一次崩溃');
  assert.equal(summary.restarts, 1, '应执行一次重启');
  assert.equal(summary.handovers, 1, '重启必须真的交棒（修复前恒为 0）');

  const handover = summary.lastHandover;
  assert.equal(handover.previousGeneration, 1);
  assert.equal(handover.generation, 2);
  assert.equal(handover.retired.length, 3, '旧世代 3 人应被封存');

  const oldIds = report.agents.map((a) => a.id);
  assert.deepEqual([...handover.retired].sort(), [...oldIds].sort(), '被封存的正是初代');

  // 隔离：旧 id 不再出现在活跃注册表
  const liveIds = liveAgents().map((a) => a.id);
  for (const id of oldIds) {
    assert.ok(!liveIds.includes(id), '旧世代必须退出活跃注册表：' + id);
  }
  // 隔离：世界状态里旧世代被标记为不再存活，并留下封存 tick
  for (const id of oldIds) {
    const w = report.world.agents[id];
    assert.equal(w.alive, false, '旧世代应被标记为不再存活：' + id);
    assert.ok(Number.isInteger(w.sealedTick), '旧世代应记录封存 tick：' + id);
    assert.equal(w.generation, 1, '世界状态里旧世代的世代号仍可查');
  }
  // 新世代：全部 generation=2 且存活
  assert.equal(liveIds.length, 3, '新世代应有 3 人');
  for (const a of liveAgents()) {
    assert.equal(a.data.generation, 2, '新世代世代号应为 2');
    assert.equal(a.data.parents, null, '开国一代没有父母');
  }
  // 观测面可查「谁被封存了」
  const gs = loop.generationStatus();
  assert.equal(gs.generation, 2);
  assert.deepEqual([...gs.sealed[0].members].sort(), [...oldIds].sort());
});

test('t5 重启对照：显式关闭交接时旧世代不被隔离（证明交接是真开关而非装饰）', async () => {
  loop.reset();
  const report = await loop.run({
    phase3: true, ticks: 6, seed: 3, agentCount: 3, collapseForce: true,
    restartHandover: false,
  });

  assert.equal(report.phase3.summary.collapses, 1);
  assert.equal(report.phase3.summary.restarts, 1, '重启记录仍应写入');
  assert.equal(report.phase3.summary.handovers, 0, '关闭交接时不应发生交棒');
  assert.equal(loop.generationStatus().generation, 1, '世代号不应推进');

  const liveIds = liveAgents().map((a) => a.id);
  assert.deepEqual([...liveIds].sort(), report.agents.map((a) => a.id).sort(),
    '关闭交接时旧世代仍在活跃注册表（对照组的"旧行为"）');
});

// ---- 3) 下一代由居民工厂真实创建 + 行为差异 ----

test('t5 下一代：由 genesis.agentFactory.template 创建（50 条池内标签），行为主体全部更替', async () => {
  loop.reset();
  const report = await loop.run({
    phase3: true, ticks: 30, seed: 3, agentCount: 3, collapseForce: true,
  });

  const handover = report.phase3.summary.lastHandover;
  assert.equal(handover.templateId, 'native', '下一代应使用居民工厂的 native 模板');
  const tpl = genesis.agentFactory.template.get({ id: 'native' });
  assert.ok(tpl !== null, 'native 模板必须存在');
  assert.equal(tpl.traits.size, genesis.tagPool.TAG_COUNT, '模板目标特质数应为 50');

  const poolKeys = new Set(genesis.tagPool.candidates().map((c) => c.key));
  const live = liveAgents();
  for (const a of live) {
    const tags = agent.traits.tagset.store.get(a.id)?.tags ?? [];
    assert.equal(tags.length, genesis.tagPool.TAG_COUNT, '新世代每人应携带 50 条特质：' + a.id);
    const unknown = tags.filter((t) => !poolKeys.has(t.key)).map((t) => t.key);
    assert.equal(unknown.length, 0, '新世代特质必须来自标签池：' + JSON.stringify(unknown));
  }

  // 行为主体全部更替：崩溃 tick 之后的所有行为都属于新世代，旧世代不再产生任何行为。
  const oldIds = new Set(report.agents.map((a) => a.id));
  const newIds = new Set(live.map((a) => a.id));
  const collapseTick = report.phase3.summary.firstCollapse.tick;
  const logs = observer.recorder.actionLog.list();
  // 注意：交接发生在**文明步骤内部**，而本 tick 的决策/行为发生在文明步骤之前。
  // 因此崩溃当 tick 仍会有旧世代的行为，这是执行顺序决定的正确结果；
  // 从崩溃 tick 的下一个 tick 起，旧世代绝不能再产生任何行为。
  const oldAfter = logs.filter((n) => oldIds.has(n.data.agentId) && n.data.tick > collapseTick);
  assert.equal(oldAfter.length, 0, '重启后旧世代不应再产生行为：' + JSON.stringify(oldAfter.slice(0, 3)));

  // 另一条泄漏路径：研究任务把负责人**记死在记录里**，progress 每 tick 用
  // rec.researchers[0] 当行为主体。不随交接改派的话，被封存的居民会"隔着世代"
  // 继续推进研究。交接必须把负责人换成新世代。
  assert.ok(Array.isArray(handover.reassignedResearch), '交接报告应包含研究改派明细');
  for (const item of handover.reassignedResearch) {
    for (const id of item.to) {
      assert.ok(newIds.has(id), '改派后的研究负责人必须是新世代成员：' + id);
    }
  }
  const ghosts = logs.filter((n) => String(n.data.agentId).startsWith('agent_')
    && n.data.tick > collapseTick && !newIds.has(n.data.agentId));
  assert.equal(ghosts.length, 0, '崩溃后不得再有非新世代主体产生的行为：'
    + JSON.stringify(ghosts.slice(0, 3)));

  const newActs = new Set(logs.filter((n) => newIds.has(n.data.agentId)).map((n) => n.data.action));
  const oldActs = new Set(logs.filter((n) => oldIds.has(n.data.agentId)).map((n) => n.data.action));
  assert.ok(newActs.size > 0, '新世代必须真的在行动');
  assert.ok(newActs.size > oldActs.size,
    '下一代行为谱应比被封存的初代更宽（世代行为差异）：new=' + [...newActs].sort().join(',')
    + ' old=' + [...oldActs].sort().join(','));
});

test('t5 重启后的新世代同样接入日程/职业/公共角色（不是"只剩活着"）', async () => {
  loop.reset();
  await loop.run({ phase3: true, ticks: 12, seed: 3, agentCount: 6, collapseForce: true });

  const live = liveAgents();
  assert.equal(live.length, 6, '新世代应有 6 人');
  for (const a of live) {
    assert.equal(a.data.generation, 2);
    const career = agent.role.career.current(a.id);
    assert.ok(career !== null && typeof career.occupation === 'string',
      '新世代应有职业（重启不得把社会结构清零）：' + a.id);
    const sched = agent.schedule.planner.current(a.id);
    assert.ok(sched !== null, '新世代应有日程：' + a.id);
  }
  const effects = agent.role.society.activeEffects();
  assert.ok(effects.holders.length >= 1, '新世代应有人担任公共角色：' + JSON.stringify(effects));
});

// ---- 4) 跨 run 不残留 ----

test('t5 代际状态跨 run 复位：reset 后世代号回到 1 且无封存记录', async () => {
  loop.reset();
  await loop.run({ phase3: true, ticks: 6, seed: 3, agentCount: 3, collapseForce: true });
  assert.equal(loop.generationStatus().generation, 2);

  loop.reset();
  const gs = loop.generationStatus();
  assert.equal(gs.generation, 1, '新一局必须从第 1 代开始');
  assert.deepEqual(gs.sealed, [], '新一局不得继承上一局的封存记录');
});
