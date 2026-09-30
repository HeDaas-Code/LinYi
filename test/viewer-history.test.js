/**
 * viewer.html 图表历史的新一局清零行为。
 *
 * 本仓库没有浏览器测试环境，因此用 DOM 桩把页面脚本真跑起来，
 * 直接调用内部的 pushHistory 并检查其状态。
 * 只断言 HTML 里「存在清零代码」是不够的——那种断言在逻辑写反时依然通过。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const VIEWER = new URL('../web/viewer.html', import.meta.url);

/** 起一个页面脚本实例：注入 DOM/localStorage 桩，暴露 pushHistory 与 history 读取器。 */
async function boot() {
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
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  // 初始自动 refresh() 让它失败即可：本测试只关心历史逻辑，
  // 不让它去碰 history（reject 会走 catch 分支，只写日志）。
  const fetchStub = async () => { throw new Error('stub: 测试不联网'); };
  const factory = new Function('document', 'localStorage', 'fetch', 'setInterval', 'clearInterval', 'window',
    script + '\n; return { pushHistory, getHistory: () => history };');
  const api = factory(document, localStorage, fetchStub, () => 0, () => {}, {});
  // store 在 boot 的作用域里，生成的函数体看不到它，因此在这里合并返回。
  return { ...api, SAVED: () => store.get('truman.history.v1') };
}

const stock = { food: 1, water: 1, energy: 1, medical: 1 };
const agent = (food) => ({ id: 'a', alive: true, needs: { food } });

test('同一局的连续 tick 累积进历史', async () => {
  const v = await boot();
  v.pushHistory(1, stock, [agent(0.5)], []);
  v.pushHistory(2, stock, [agent(0.4)], []);
  v.pushHistory(3, stock, [agent(0.3)], []);
  assert.equal(v.getHistory().length, 3, '三个不同 tick 应各留一条');
  assert.deepEqual(v.getHistory().map((h) => h.tick), [1, 2, 3]);
});

test('重复 tick 不重复记录（刷新不产生重复点）', async () => {
  const v = await boot();
  v.pushHistory(7, stock, [agent(0.5)], []);
  v.pushHistory(7, stock, [agent(0.5)], []);
  v.pushHistory(7, stock, [agent(0.5)], []);
  assert.equal(v.getHistory().length, 1, '同一个 tick 只应留一条');
});

test('tick 回退判定为新一局并清空图表', async () => {
  const v = await boot();
  for (let t = 1; t <= 12; t += 1) v.pushHistory(t, stock, [agent(0.5)], []);
  assert.equal(v.getHistory().length, 12, '前置条件：旧一局应有 12 条');

  v.pushHistory(1, stock, [agent(0.9)], []);
  const after = v.getHistory();
  assert.equal(after.length, 1, '新一局应只剩 1 条，旧曲线被清空');
  assert.equal(after[0].tick, 1);
  assert.equal(after[0].needs[0], 0.9, '留下的必须是新一局的点，不是旧的');
});

test('清零后继续推进仍正常累积', async () => {
  const v = await boot();
  for (let t = 1; t <= 5; t += 1) v.pushHistory(t, stock, [agent(0.5)], []);
  v.pushHistory(1, stock, [agent(0.5)], []);
  v.pushHistory(2, stock, [agent(0.5)], []);
  assert.deepEqual(v.getHistory().map((h) => h.tick), [1, 2], '新一局应从 1 重新累积');
});

test('清零会写回本地存储，刷新后不会复活旧一局', async () => {
  const v = await boot();
  for (let t = 1; t <= 4; t += 1) v.pushHistory(t, stock, [agent(0.5)], []);
  v.pushHistory(1, stock, [agent(0.5)], []);
  const saved = JSON.parse(v.SAVED());
  assert.equal(saved.length, 1, '持久化的历史也必须被清空，否则刷新即复活旧曲线');
  assert.equal(saved[0].tick, 1);
});

test('tick 前进时绝不清空（避免正常推进被误判为新局）', async () => {
  const v = await boot();
  v.pushHistory(3, stock, [agent(0.5)], []);
  v.pushHistory(4, stock, [agent(0.5)], []);
  assert.deepEqual(v.getHistory().map((h) => h.tick), [3, 4], '前进不得触发清零');
});
