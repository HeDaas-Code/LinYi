/**
 * truman-town.social.relationship.romance — 恋爱关系 / Romance
 *
 * 处理表白（propose）、接受（accept）与分手（breakup），维护配对纽带状态
 * （none → proposed → paired / broken）。以 graph store 持久化，排序对键去重。
 */

import * as graph from '../../infra/store/graph.js';

const TYPE = 'social.romance';
const PREFIX = 'romance:';

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('romance: ' + label + ' 必须为非空字符串');
  }
}

function sorted(a, b) {
  return a < b ? { a, b } : { a: b, b: a };
}

function nodeId(a, b) {
  const p = sorted(a, b);
  return PREFIX + p.a + ':' + p.b;
}

function load(a, b) {
  const node = graph.read(nodeId(a, b));
  if (node && node.data) return node.data;
  const p = sorted(a, b);
  return { a: p.a, b: p.b, state: 'none', strength: 0, history: [] };
}

function save(state) {
  graph.write({ id: nodeId(state.a, state.b), type: TYPE, data: state });
  return structuredClone(state);
}

/** 表白：建立 proposed 纽带。 */
export function propose({ from, to } = {}) {
  assertId(from, 'from');
  assertId(to, 'to');
  if (from === to) throw new TypeError('romance.propose: 不能与自己建立恋爱关系');
  const state = load(from, to);
  if (state.state === 'paired') throw new Error('romance.propose: 双方已是伴侣');
  state.state = 'proposed';
  state.history.push({ event: 'propose', from, ts: Date.now() });
  return save(state);
}

/** 接受表白：proposed → paired。 */
export function accept({ from, to } = {}) {
  assertId(from, 'from');
  assertId(to, 'to');
  const state = load(from, to);
  if (state.state !== 'proposed') throw new Error('romance.accept: 没有待接受的表白');
  state.state = 'paired';
  state.strength = Math.max(state.strength, 0.5);
  state.history.push({ event: 'accept', ts: Date.now() });
  return save(state);
}

/** 分手：→ broken。 */
export function breakup({ a, b } = {}) {
  assertId(a, 'a');
  assertId(b, 'b');
  const state = load(a, b);
  state.state = 'broken';
  state.history.push({ event: 'breakup', ts: Date.now() });
  return save(state);
}

/** 读取当前关系状态（none/proposed/paired/broken），辅助方法。 */
export function state({ a, b } = {}) {
  assertId(a, 'a');
  assertId(b, 'b');
  return load(a, b).state;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
