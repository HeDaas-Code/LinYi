import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { graph, identity, rng, pubsub } from '../src/infra/index.js';
import { clock } from '../src/runtime/index.js';
import { recorder } from '../src/observer/index.js';
import { inventory, crafting } from '../src/agent/index.js';
import { building } from '../src/town/index.js';

const { item, backpack } = inventory;
const { recipe, workbench, construction, writing } = crafting;
const { validator, executor, output } = workbench;

function resetAll() {
  graph.__reset();
  identity.__reset();
  rng.__reset();
  pubsub.__reset();
  clock.__reset();
  recorder.__reset();
  item.__reset();
  backpack.__reset();
  recipe.__reset();
  executor.__reset();
  construction.__reset();
  writing.__reset();
}

beforeEach(() => {
  resetAll();
});

test('item: define 生成有序 id，query 按 id / category 检索', () => {
  const wood = item.define({ category: 'material', name: '木头' });
  const metal = item.define({ category: 'material', name: '金属' });
  const axe = item.define({ category: 'tool', name: '斧头' });

  assert.match(wood.id, /^item_[0-9]{12}$/);
  assert.ok(wood.id < metal.id && metal.id < axe.id);

  assert.equal(item.query({ id: wood.id }).name, '木头');
  assert.equal(item.query({ id: 'missing' }), null);

  const mats = item.query({ category: 'material' });
  assert.deepEqual(mats.map((i) => i.id), [wood.id, metal.id]);
  assert.equal(item.query().length, 3);
});

test('item: properties 深拷贝隔离', () => {
  const props = { weight: 2 };
  const wood = item.define({ category: 'material', properties: props });
  props.weight = 999;
  assert.equal(item.query({ id: wood.id }).properties.weight, 2);
});

test('backpack: add/list/remove 与重量计算', () => {
  const wood = item.define({ category: 'material', properties: { weight: 2 } });
  const stone = item.define({ category: 'material', properties: { weight: 3 } });

  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 2 });
  backpack.add({ agentId: 'a1', itemId: stone.id, quantity: 1 });

  const bp = backpack.list({ agentId: 'a1' });
  assert.equal(bp.count, 3);
  assert.equal(bp.weight, 2 * 2 + 3 * 1);

  const removed = backpack.remove({ agentId: 'a1', itemId: wood.id, quantity: 1 });
  assert.equal(removed.removed, 1);
  assert.equal(removed.remaining, 1);
  assert.equal(backpack.list({ agentId: 'a1' }).items[wood.id], 1);
});

test('backpack: 容量与负重约束', () => {
  const wood = item.define({ category: 'material', properties: { weight: 5 } });
  backpack.capacity({ agentId: 'a1', capacity: 2 });
  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 2 });
  assert.throws(() => backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 1 }), /超出容量/);

  backpack.capacity({ agentId: 'a2', maxWeight: 3 });
  assert.throws(() => backpack.add({ agentId: 'a2', itemId: wood.id, quantity: 1 }), /超出负重/);
});

test('backpack: 未定义物品、移除不足、非法数量抛出', () => {
  const wood = item.define({ category: 'material' });
  assert.throws(() => backpack.add({ agentId: 'a1', itemId: 'nope' }), /未定义/);
  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 1 });
  assert.throws(() => backpack.remove({ agentId: 'a1', itemId: wood.id, quantity: 2 }), /不足/);
  assert.throws(() => backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 0 }), /quantity/);
});

test('recipe: define/query/learn/isLearned', () => {
  recipe.define({ id: 'axe', name: '木斧', kind: 'item', materials: { wood: 2, metal: 1 }, ticks: 3, output: { itemId: 'axe_item', quantity: 1 } });
  assert.equal(recipe.query({ id: 'axe' }).ticks, 3);
  assert.equal(recipe.query({ id: 'axe' }).materials.wood, 2);
  assert.equal(recipe.query({ kind: 'item' }).length, 1);
  assert.equal(recipe.query({ id: 'missing' }), null);

  recipe.learn({ agentId: 'a1', recipeId: 'axe' });
  assert.equal(recipe.isLearned('a1', 'axe'), true);
  assert.equal(recipe.isLearned('a2', 'axe'), false);
  assert.throws(() => recipe.learn({ agentId: 'a1', recipeId: 'nope' }), /不存在/);
});

test('recipe: 非法材料数量抛出', () => {
  assert.throws(() => recipe.define({ id: 'bad', materials: { wood: 0 } }), /正整数/);
});

test('validator: materials 与 check（材料不足 / 容量不足 / 通过）', () => {
  const wood = item.define({ category: 'material' });
  const metal = item.define({ category: 'material' });
  const axe = item.define({ category: 'tool' });
  recipe.define({ id: 'axe', kind: 'item', materials: { [wood.id]: 2, [metal.id]: 1 }, ticks: 2, output: { itemId: axe.id, quantity: 1 } });

  const m = validator.materials({ recipeId: 'axe' });
  assert.deepEqual(m.materials, { [wood.id]: 2, [metal.id]: 1 });
  assert.equal(m.ticks, 2);

  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 1 });
  const missing = validator.check({ agentId: 'a1', recipeId: 'axe' });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, { [wood.id]: 1, [metal.id]: 1 });

  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 1 });
  backpack.add({ agentId: 'a1', itemId: metal.id, quantity: 1 });
  backpack.capacity({ agentId: 'a1', capacity: 2 });
  const full = validator.check({ agentId: 'a1', recipeId: 'axe' });
  assert.equal(full.ok, false);
  assert.equal(full.reason, '背包容量不足');

  backpack.capacity({ agentId: 'a1', capacity: 10 });
  assert.equal(validator.check({ agentId: 'a1', recipeId: 'axe' }).ok, true);
});

test('executor.craft: 扣材料并登记耗时任务', () => {
  const wood = item.define({ category: 'material' });
  const metal = item.define({ category: 'material' });
  const axe = item.define({ category: 'tool' });
  recipe.define({ id: 'axe', kind: 'item', materials: { [wood.id]: 2, [metal.id]: 1 }, ticks: 3, output: { itemId: axe.id, quantity: 1 } });
  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 5 });
  backpack.add({ agentId: 'a1', itemId: metal.id, quantity: 3 });

  const job = executor.craft({ agentId: 'a1', recipeId: 'axe' });
  assert.equal(job.status, 'pending');
  assert.equal(job.remainingTicks, 3);
  assert.equal(backpack.list({ agentId: 'a1' }).items[wood.id], 3);
  assert.equal(backpack.list({ agentId: 'a1' }).items[metal.id], 2);
  assert.equal(executor.pending().length, 1);
});

test('executor.tick: 逐 tick 推进，归零后产物入背包并写观察日志', () => {
  const wood = item.define({ category: 'material' });
  const axe = item.define({ category: 'tool' });
  recipe.define({ id: 'axe', kind: 'item', materials: { [wood.id]: 1 }, ticks: 2, output: { itemId: axe.id, quantity: 1 } });
  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 1 });

  executor.craft({ agentId: 'a1', recipeId: 'axe' });

  clock.tick();
  let done = executor.tick();
  assert.equal(done.length, 0);
  assert.equal(executor.pending().length, 1);
  assert.equal(backpack.list({ agentId: 'a1' }).items[axe.id], undefined);

  clock.tick();
  done = executor.tick();
  assert.equal(done.length, 1);
  assert.equal(done[0].produced.items[axe.id], 1);
  assert.equal(done[0].completedAtTick, 2);
  assert.equal(executor.pending().length, 0);

  const logs = recorder.actionLog.list();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].data.agentId, 'a1');
  assert.equal(logs[0].data.action, 'craft:axe');
  assert.equal(logs[0].data.tick, 2);
});

test('executor.craft: 非物品配方抛出', () => {
  recipe.define({ id: 'barn', kind: 'building', materials: {}, output: {} });
  assert.throws(() => executor.craft({ agentId: 'a1', recipeId: 'barn' }), /不是物品配方/);
});

test('construction: build 扣材料，tick 完成后写入结构并记录日志', () => {
  const wood = item.define({ category: 'material' });
  recipe.define({ id: 'barn', name: '谷仓', kind: 'building', materials: { [wood.id]: 3 }, ticks: 2, output: { buildingId: 'barn', name: '谷仓' } });
  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 5 });

  const job = construction.build({ agentId: 'a1', recipeId: 'barn' });
  assert.equal(job.remainingTicks, 2);
  assert.equal(backpack.list({ agentId: 'a1' }).items[wood.id], 2);

  clock.tick(); construction.tick();
  clock.tick();
  const done = construction.tick();
  assert.equal(done.length, 1);
  // 契约已统一到 town/building/structure.js：
  //   id 前缀 town:building:（此前 construction 自用 structure:，导致建的房子在
  //   structure 模块里查不到）；data 形状也统一（不再有 integrity 字段）。
  // 同时必须能被 structure 模块查到——这才是合并契约要保证的事。
  assert.equal(done[0].structure.id, 'town:building:barn');
  assert.equal(done[0].structure.data.name, '谷仓');
  assert.equal(done[0].structure.data.builtBy, 'a1');
  assert.equal(done[0].structure.data.demolished, false);
  const listed = building.structure.query();
  assert.ok(listed.some((b) => b.id === 'barn'),
    'construction 建成的房子必须出现在 building.structure.query() 里');
  assert.equal(graph.read('town:building:barn').data.kind, 'crafted');
  assert.equal(recorder.actionLog.list().length, 1);
});

test('writing: write_book 扣材料，tick 完成后书籍入背包并记录日志', () => {
  const wood = item.define({ category: 'material' });
  recipe.define({ id: 'book', name: '书', kind: 'book', materials: { [wood.id]: 1 }, ticks: 1, output: { category: 'book' } });
  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 2 });

  const job = writing.write_book({ agentId: 'a1', recipeId: 'book', title: '避难所日记', content: '第一天' });
  assert.equal(job.remainingTicks, 1);
  assert.equal(backpack.list({ agentId: 'a1' }).items[wood.id], 1);

  clock.tick();
  const done = writing.tick();
  assert.equal(done.length, 1);
  assert.equal(done[0].book.category, 'book');
  assert.equal(done[0].book.properties.title, '避难所日记');
  assert.equal(done[0].book.properties.author, 'a1');
  assert.equal(backpack.list({ agentId: 'a1' }).items[done[0].book.id], 1);
  assert.equal(recorder.actionLog.list().length, 1);
});

test('writing: 不传 recipeId 的自由写作（默认 1 tick、不耗材料）', () => {
  const job = writing.write_book({ agentId: 'a1', title: '遗言', content: '...' });
  assert.equal(job.remainingTicks, 1);
  clock.tick();
  const done = writing.tick();
  assert.equal(done.length, 1);
  assert.equal(done[0].book.properties.title, '遗言');
  assert.equal(recorder.actionLog.list().length, 1);
});

test('writing/construction: 配方 kind 不符抛出', () => {
  recipe.define({ id: 'axe', kind: 'item', materials: {}, output: {} });
  assert.throws(() => construction.build({ agentId: 'a1', recipeId: 'axe' }), /不是建筑配方/);
  assert.throws(() => writing.write_book({ agentId: 'a1', recipeId: 'axe' }), /不是书籍配方/);
});

test('闭环：三个任务队列独立推进，互不干扰', () => {
  const wood = item.define({ category: 'material' });
  const axe = item.define({ category: 'tool' });
  recipe.define({ id: 'axe', kind: 'item', materials: { [wood.id]: 1 }, ticks: 1, output: { itemId: axe.id, quantity: 1 } });
  recipe.define({ id: 'barn', kind: 'building', materials: { [wood.id]: 1 }, ticks: 1, output: { buildingId: 'barn' } });
  recipe.define({ id: 'book', kind: 'book', materials: { [wood.id]: 1 }, ticks: 1, output: { category: 'book' } });
  backpack.add({ agentId: 'a1', itemId: wood.id, quantity: 10 });

  executor.craft({ agentId: 'a1', recipeId: 'axe' });
  construction.build({ agentId: 'a1', recipeId: 'barn' });
  writing.write_book({ agentId: 'a1', recipeId: 'book', title: '书' });

  assert.equal(executor.pending().length, 1);
  assert.equal(construction.pending().length, 1);
  assert.equal(writing.pending().length, 1);

  clock.tick();
  const craftDone = executor.tick();
  assert.equal(craftDone.length, 1);
  assert.equal(executor.pending().length, 0);
  assert.equal(construction.pending().length, 1);
  assert.equal(writing.pending().length, 1);

  clock.tick();
  construction.tick();
  writing.tick();
  assert.equal(construction.pending().length, 0);
  assert.equal(writing.pending().length, 0);

  assert.equal(recorder.actionLog.list().length, 3);
  assert.equal(backpack.list({ agentId: 'a1' }).items[axe.id], 1);
});
