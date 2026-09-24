import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop, registry } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as town from '../src/town/index.js';
import * as economy from '../src/economy/index.js';
import * as agent from '../src/agent/index.js';
import * as social from '../src/social/index.js';
import * as tagsetStore from '../src/agent/traits/tagset/store.js';

function eventTopics() {
  return observer.recorder.eventLog.list().map((n) => n.data.topic);
}

function actionKinds() {
  return observer.recorder.actionLog.list().map((n) => n.data.action);
}

test('phase2：家庭/经济/制作/居住/健康被每 tick 驱动并写 observer', async () => {
  loop.reset();
  // P1：制作/建造不再由代码在固定 tick 硬编码（旧 runCrafting 写死 agents[0..2]），
  // 改由居民决策驱动，因此需要足够 tick 让居民备料并选出 craft。
  // 实测 10 tick 时 crafted=0，60 tick 时 crafted=3 且石斧确实进入背包。
  const report = await loop.run({ phase2: true, ticks: 60, seed: 42, agentCount: 3 });

  assert.ok(report.phase2, 'run 报告应包含 phase2 摘要');
  assert.equal(report.phase2.seed.shelter, 5, '应生成 5 栋初始避难所建筑');
  assert.equal(report.phase2.seed.accounts, 3, '应为 3 个居民开户');

  const agents = registry.lookup({ type: 'agent' });
  assert.ok(agents.length > 3, '应产生子代（居民数 > 3）');
  assert.ok(report.phase2.summary.childrenBorn >= 1, '生育事件计数应 >= 1');

  // 事件日志：生育 / 市场交易 / 疫情 / 隔离 / 居住分配
  const topics = eventTopics();
  // P1：生育改由居民双向决策产生（court → accept → procreation），
  // 事件链上应能看到求偶，而不只是无条件的配对结果。
  assert.ok(topics.includes('agent.action.court'), '求偶行动应写 event-log');
  assert.ok(topics.includes('social.procreation'), '生育事件应写 event-log');
  assert.ok(topics.includes('economy.trade'), '市场交易应写 event-log');
  assert.ok(topics.includes('health.epidemic'), '疫情检测应写 event-log');
  assert.ok(topics.includes('health.quarantine'), '隔离应写 event-log');

  // 行为日志：制作 / 建造 / 写书。P1 后 actionLog 的 action 字段为**行动名**
  // （craft/build/write/...），不再是 `craft:axe` 这类带产物名的旧格式。
  const actions = actionKinds();
  assert.ok(actions.includes('craft'), '制作行为应写 action-log');
  assert.ok(actions.includes('build'), '建造行为应写 action-log');
  assert.ok(actions.includes('write'), '写书行为应写 action-log');
  // P1：社交行动进入决策环，也应留下行为日志
  assert.ok(actions.includes('socialize') || actions.includes('court'), '社交行动应写 action-log');

  // 居住分配：每个居民（含子代）都有住所
  for (const a of agents) {
    assert.ok(town.residence.residenceOf(a.id) !== null, a.id + ' 应有住所');
  }

  // 经济：市场有成交价，账本有交易
  assert.ok(report.phase2.summary.trades >= 1, '市场交易计数应 >= 1');
  assert.equal(economy.market.price.quote({ symbol: 'food' }), 4, '市场应发现 food 价格');

  // 制作：石斧产出进入背包。P1 后产物归属由居民自己的行动决定（不再固定给 agents[0]），
  // 因此汇总全体居民背包，并同时校验 phase2 的制作计数确实来自决策。
  const axe = agent.inventory.item.query({ category: 'tool' }).find((i) => i.name === '石斧');
  assert.ok(axe, '应定义石斧物品');
  assert.ok(report.phase2.summary.crafted >= 1, '居民应通过 craft 行动产出物品');
  let axeHeld = 0;
  for (const a of agents) axeHeld += agent.inventory.backpack.list({ agentId: a.id }).items[axe.id] ?? 0;
  assert.ok(axeHeld >= 1, '石斧应已制作并进入居民背包（合计 ' + axeHeld + '）');

  // 观察者编年志持续增长
  const chronicle = observer.chronicle.compiler.compile().counts;
  assert.ok(chronicle.total > 0, '编年志总计数应 > 0');
});

test('phase2 生育事件产生子代（50 标签 + 谱系注册）', async () => {
  loop.reset();
  // P1：生育需先 court 再 accept（居民双向决策），4 tick 不足以完成该链路，
  // 实测 2 居民 × 4 tick children=0；改为 60 tick（该长度下稳定生出 1 个）。
  await loop.run({ phase2: true, ticks: 60, seed: 7, agentCount: 2 });

  const agents = registry.lookup({ type: 'agent' });
  const children = agents.filter((a) => (a.data.name ?? '').startsWith('新生儿'));
  assert.ok(children.length >= 1, '应产生至少 1 个子代');

  for (const c of children) {
    const tags = tagsetStore.get(c.id);
    assert.equal(tags.tags.length, 50, '子代应有 50 个特质标签');
    const trace = social.family.lineage.trace({ agentId: c.id });
    assert.ok(trace, '子代应有谱系');
    assert.equal(trace.parents.length, 2, '子代谱系应有双亲');
  }
});

test('phase2 复位后可复现（同 seed 同摘要）', async () => {
  const r1 = await loop.run({ phase2: true, ticks: 5, seed: 11, agentCount: 3 });
  const r2 = await loop.run({ phase2: true, ticks: 5, seed: 11, agentCount: 3 });
  assert.deepEqual(r1.phase2.summary, r2.phase2.summary, '同 seed 的 stage2 摘要应一致');
  assert.equal(
    registry.lookup({ type: 'agent' }).length,
    3 + r2.phase2.summary.childrenBorn,
    '复位后居民数 = 初始 3 + 子代数',
  );
});

test('phase2 未开启时主循环行为不变（不触发阶段二）', async () => {
  loop.reset();
  const report = await loop.run({ ticks: 3, seed: 1, agentCount: 2 });
  assert.equal(report.phase2, undefined, 'phase2 关闭时不应有阶段二摘要');
  assert.equal(report.steps.every((s) => s.phase2 === undefined), true);
});
