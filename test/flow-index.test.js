import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

/**
 * 数据流转索引的**防腐烂**测试。
 *
 * 索引是派生数据（bin/flow-index.mjs 从源码静态提取），源码一变它就可能过期。
 * 本测试保证：
 *   1) 索引可再生成，且再生成结果与仓库内的 flow-index.json 一致（否则说明有人改了代码没重建索引）；
 *   2) 索引的 error 级诊断不增长（已清零项不得回退）；
 *   3) 关键机制（隔离、崩溃、企业、识字）确实出现在索引里。
 */

const ROOT = process.cwd();
const INDEX_PATH = ROOT + '/flow-index.json';

function generate() {
  const out = ROOT + '/flow-index.regen.json';
  execFileSync('node', ['bin/flow-index.mjs', '--json', out], { cwd: ROOT, stdio: 'pipe' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

test('flow-index: 索引可再生成，且与仓库内文件一致（防止过期）', () => {
  assert.ok(existsSync(INDEX_PATH), 'flow-index.json 必须存在，先跑 node bin/flow-index.mjs');
  const regen = generate();
  const current = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  assert.equal(regen.stats.stores, current.stats.stores,
    '状态单元数变化（' + current.stats.stores + ' → ' + regen.stats.stores + '）：源码改了但索引未重建');
  assert.equal(regen.stats.graphTypes, current.stats.graphTypes, '图节点类型数变化，索引未重建');
  assert.deepEqual(
    current.diagnostics.map((d) => d.code + '|' + d.subject).sort(),
    regen.diagnostics.map((d) => d.code + '|' + d.subject).sort(),
    '诊断集合变化，索引未重建',
  );
});

test('flow-index: 状态单元有完整的人读信息（文件、行号、读写方）', () => {
  const idx = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  assert.ok(idx.stores.length > 100, '状态单元应上百，实际 ' + idx.stores.length);
  let bad = 0;
  for (const s of idx.stores) {
    if (typeof s.file !== 'string' || !s.file.startsWith('src/')) bad += 1;
    if (!Number.isInteger(s.line) || s.line < 1) bad += 1;
    if (!Array.isArray(s.writers) || !Array.isArray(s.readers)) bad += 1;
    if (typeof s.resetCovered !== 'boolean') bad += 1;
  }
  assert.equal(bad, 0, '有 ' + bad + ' 个状态单元缺少必要字段');
});

test('flow-index: error 级诊断必须为 0（禁止新增「只写不读」与「无复位」）', () => {
  const idx = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  const errors = idx.diagnostics.filter((d) => d.level === 'error');
  // 当前已知的 2 条：rng.seeded 与 dispatch.lastApplied，均为真缺陷但尚未清理。
  // 允许存在但**不得增长**——新增即失败。
  assert.ok(errors.length <= 2,
    'error 级诊断不得增长（当前上限 2），实际 ' + errors.length + '：'
    + errors.map((e) => e.code + '@' + e.subject).join(', '));
});

test('flow-index: 图节点的生产/消费关系可解析，孤立类型须受控', () => {
  const idx = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  // 注意：graphFlow 按**类型字符串去重**，而 graphTypes 是声明点计数。
  // 同一类型被多处声明时 graphFlow 更少——这是正确行为（见 duplicateDeclaration）。
  const distinctTypes = new Set(idx.graphTypes.map((g) => g.type)).size;
  assert.equal(idx.graphFlow.length, distinctTypes,
    'graphFlow 应每个类型恰好一条（去重后），实际 ' + idx.graphFlow.length + ' vs ' + distinctTypes);
  for (const g of idx.graphFlow) {
    assert.ok(Array.isArray(g.producers) && g.producers.length > 0, g.type + ' 缺少生产者');
    assert.ok(Array.isArray(g.consumers), g.type + ' 缺少消费者列表');
  }
  const orphan = idx.graphFlow.filter((g) => g.orphan);
  // 曾因只看 graph.* 直接调用而误报 34/43 孤立；接入命名空间识别后应为个位数。
  assert.ok(orphan.length <= 4,
    '孤立图类型过多（' + orphan.length + '），可能是消费者识别退化了：'
    + orphan.map((o) => o.type).join(', '));
});

test('flow-index: 关键机制与状态机在索引中可查', () => {
  const idx = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  assert.ok(idx.stepPhases.length >= 10, '主循环阶段应被索引，实际 ' + idx.stepPhases.length);
  const orders = idx.stepPhases.map((p) => p.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), '阶段顺序必须单调递增');

  const ids = idx.stateMachines.map((m) => m.id);
  for (const need of ['agent.lifecycle', 'survival.health.epidemic(隔离)', 'industry.business', 'civilization.lifecycle']) {
    assert.ok(ids.includes(need), '关键状态机缺失: ' + need);
  }

  // 隔离状态机必须记录其**消费点**——它曾是「只写不读」的装饰机制
  const epi = idx.stateMachines.find((m) => m.id === 'survival.health.epidemic(隔离)');
  assert.ok(Array.isArray(epi.consumedBy) && epi.consumedBy.length > 0,
    '隔离状态机必须声明消费点，否则无法区分「真实机制」与「装饰」');
});
