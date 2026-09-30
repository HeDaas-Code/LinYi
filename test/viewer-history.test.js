/**
 * viewer.html 的图表采样与清零行为。
 *
 * 采样契约：**只有后端推来的 sample 帧能产生采样点**，前端刷新永不采样。
 * 本仓库没有浏览器测试环境，因此用 DOM 桩把页面脚本真跑起来，
 * 直接调用内部函数并检查状态——只断言"源码里有 EventSource"证明不了
 * "刷新不会多出一个点"。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const VIEWER = new URL('../web/viewer.html', import.meta.url);
const LS_HISTORY = 'truman.history.v1';

const sample = (tick, food = 0.5) => ({
  tick,
  resources: { food: 10, water: 20, energy: 30, medical: 40 },
  needs: { min: food, max: food, avg: food },
  latency: { count: 1, avg: 100, max: 100 },
  alive: 1,
  population: 1,
});

const world = (tick) => ({
  tick,
  committedTick: tick,
  agents: [{ id: 'agent_000000000001', type: 'agent', data: { name: '居民1', alive: true } }],
  world: { needs: { agent_000000000001: { food: 0.4, water: 0.4 } }, agents: {}, resources: {} },
  resources: {
    food: { stockpile: 10 }, water: { stockpile: 20 },
    energy: { stockpile: 30 }, medical: { stockpile: 40 },
  },
});

const settle = () => new Promise((r) => setTimeout(r, 5));

/** 起一个页面实例。saved 模拟"上次访问留下的已持久化历史"。 */
async function boot({ saved = null, tick = 5 } = {}) {
  const html = await readFile(VIEWER, 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const el = () => ({
    innerHTML: '', textContent: '', className: '', value: '',
    style: {}, firstElementChild: { style: {} },
    classList: { add() {}, remove() {}, toggle() {} }, onclick: null, onchange: null,
  });
  const nodes = new Map();
  const document = {
    getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, el()); return nodes.get(id); },
    querySelectorAll: () => [],
  };
  const store = new Map();
  if (saved !== null) store.set(LS_HISTORY, JSON.stringify(saved));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const fetchStub = async (url) => ({
    ok: true,
    json: async () => (url.includes('/world/state') ? world(tick) : []),
  });

  // EventSource 必须显式遮蔽：新版 Node 有全局 EventSource，
  // 否则页面会自动去连真实端口，测试就不再是离线的了。
  const factory = new Function('document', 'localStorage', 'fetch', 'setInterval', 'clearInterval', 'window', 'EventSource',
    script + '\n; return { pushSample, refresh, getHistory: () => history, renderCharts };');
  const api = factory(document, localStorage, fetchStub, () => 0, () => {}, {}, undefined);
  return { ...api, node: (id) => document.getElementById(id), SAVED: () => store.get(LS_HISTORY) };
}

// ---------------------------------------------------------------------------
// 采样来源：只有 sample 帧
// ---------------------------------------------------------------------------

test('刷新不产生采样点（用户报的 bug：刷新一次多一个采样）', async () => {
  const v = await boot({ saved: [sample(5)] });
  await settle(); // 等页面加载时那次自动 refresh 落地
  assert.equal(v.getHistory().length, 1, '页面加载的刷新不得新增采样');

  await v.refresh();
  await v.refresh();
  await v.refresh();
  assert.equal(v.getHistory().length, 1, '连续刷新三次仍不得新增采样');
  assert.equal(v.getHistory()[0].tick, 5);
});

test('刷新页面后仍不重复采样（内存游标归零也不影响）', async () => {
  // 上次访问已持久化 tick 5；重新打开页面（新实例、内存状态全新）再刷新。
  const v = await boot({ saved: [sample(3), sample(4), sample(5)] });
  await settle();
  await v.refresh();
  assert.deepEqual(v.getHistory().map((h) => h.tick), [3, 4, 5], '重开页面后刷新不得追加 tick 5 的副本');
});

test('刷新即使看到更新的 tick 也不采样（采样只能来自 sample 帧）', async () => {
  // 这一条才是"刷新不采样"的**机制**守卫：上一条只验证了症状。
  // 若刷新自行采样，去重仍会挡住同一 tick 的重复，
  // 于是"刷新一次多一个点"看起来消失了——但采样节奏实际已被刷新频率接管。
  // 这里让世界 tick 领先于历史，刷新若偷偷采样就会多出 tick 9。
  const v = await boot({ saved: [sample(5)], tick: 9 });
  await settle();
  await v.refresh();
  await v.refresh();
  assert.deepEqual(
    v.getHistory().map((h) => h.tick), [5],
    '刷新看到 tick 9 也不得自行入图——那是后端 sample 帧的职责',
  );
});

test('sample 帧按 tick 去重，同一 tick 只入图一次', async () => {
  const v = await boot();
  assert.equal(v.pushSample(sample(1)), true, '首个 tick 应入图');
  assert.equal(v.pushSample(sample(1)), false, '同一 tick 第二次应被拒');
  assert.equal(v.pushSample(sample(2)), true);
  assert.deepEqual(v.getHistory().map((h) => h.tick), [1, 2]);
});

test('sample 帧正常累积并保留快照字段', async () => {
  const v = await boot();
  for (let t = 1; t <= 4; t += 1) v.pushSample(sample(t, 0.1 * t));
  const h = v.getHistory();
  assert.equal(h.length, 4);
  assert.equal(h[3].resources.food, 10, '资源快照必须入图');
  assert.equal(h[3].needs.max, 0.4, '需求快照必须入图');
  assert.equal(h[3].latency.avg, 100, '模型耗时快照必须入图');
});

// ---------------------------------------------------------------------------
// 新一局清零
// ---------------------------------------------------------------------------

test('tick 回退判定为新一局并清空图表', async () => {
  const v = await boot({ saved: Array.from({ length: 12 }, (_, i) => sample(i + 1)) });
  await settle();
  assert.equal(v.getHistory().length, 12, '前置条件：旧一局应有 12 条');

  v.pushSample(sample(1, 0.9));
  const after = v.getHistory();
  assert.equal(after.length, 1, '新一局应只剩 1 条');
  assert.equal(after[0].tick, 1);
  assert.equal(after[0].needs.max, 0.9, '留下的必须是新一局的点');
});

test('清零立即重绘图表，而不是等到下一次刷新', async () => {
  const v = await boot({ saved: Array.from({ length: 12 }, (_, i) => sample(i + 1)) });
  await settle();
  assert.match(v.node('chart-note').textContent, /已采样 12 个 tick/, '前置条件：图表说明反映旧一局');

  v.pushSample(sample(1));
  assert.match(v.node('chart-note').textContent, /已采样 1 个 tick/, '清零后必须当场重绘，不能等刷新');
});

test('清零写回本地存储，刷新后不会复活旧一局', async () => {
  const v = await boot({ saved: [sample(1), sample(2), sample(3), sample(4)] });
  await settle();
  v.pushSample(sample(1));
  const persisted = JSON.parse(v.SAVED());
  assert.equal(persisted.length, 1, '持久化历史也必须被清空');
  assert.equal(persisted[0].tick, 1);
});

test('tick 前进时绝不清空', async () => {
  const v = await boot();
  v.pushSample(sample(3));
  v.pushSample(sample(4));
  assert.deepEqual(v.getHistory().map((h) => h.tick), [3, 4], '前进不得触发清零');
});

test('tick 跳号时如实记缺口，不伪造中间点', async () => {
  const v = await boot();
  v.pushSample(sample(1));
  v.pushSample({ ...sample(5), missed: 3 });
  assert.deepEqual(v.getHistory().map((h) => h.tick), [1, 5], '不得补出 2/3/4 三个假点');
  assert.ok(
    v.node('log-lines').innerHTML.includes('3 个 tick 未采样'),
    '缺口必须写进日志，而不是被静默吞掉',
  );
});
