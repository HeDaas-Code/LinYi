/**
 * truman-town.social.culture.meme — 模因 / Meme
 *
 * 观念在居民间传播、变异与消亡。spread 把一个模因从一名居民传给另一名居民并
 * 累积传播范围（carriers），mutate 用 infra.rng 变异出新一代（改变适应度 fitness），
 * extinct 标记模因消亡。全部写入 observer 事件日志，保证传播链可追踪。
 */

import * as graph from '../../infra/store/graph.js';
import * as rng from '../../infra/rng.js';
import * as recorder from '../../observer/recorder/index.js';

const MEME_TYPE = 'social.culture.meme';
const PREFIX = 'meme:';

function assertMemeId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('meme: memeId 必须为非空字符串');
  }
}

function load(memeId) {
  const node = graph.read(PREFIX + memeId);
  return node && node.data ? structuredClone(node.data) : null;
}

function save(meme) {
  graph.write({ id: PREFIX + meme.id, type: MEME_TYPE, data: meme });
  return structuredClone(meme);
}

function seed(memeId) {
  return save({
    id: memeId,
    text: memeId,
    fitness: 0.5,
    generation: 0,
    variants: 0,
    carriers: [],
    extinct: false,
  });
}

/**
 * 传播一个模因：从 fromAgent 传给 toAgent，累积传播范围并写事件日志。
 * 模因不存在时按 memeId 播种。
 * @param {{ memeId: string, fromAgent: string, toAgent: string, tick?: number }} input
 * @returns {object} 模因快照
 */
export function spread({ memeId, fromAgent, toAgent, tick = 0 } = {}) {
  assertMemeId(memeId);
  if (typeof fromAgent !== 'string' || fromAgent.trim() === '') {
    throw new TypeError('meme.spread: fromAgent 必须为非空字符串');
  }
  if (typeof toAgent !== 'string' || toAgent.trim() === '') {
    throw new TypeError('meme.spread: toAgent 必须为非空字符串');
  }
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('meme.spread: tick 必须为非负整数');
  }
  let meme = load(memeId) ?? seed(memeId);
  if (meme.extinct) {
    throw new Error('meme.spread: 模因 "' + memeId + '" 已消亡');
  }
  const carriers = new Set(meme.carriers ?? []);
  carriers.add(fromAgent);
  carriers.add(toAgent);
  meme.carriers = [...carriers];

  const before = meme.carriers.length;
  recorder.eventLog.record({
    tick,
    topic: 'culture.meme.spread',
    agentId: toAgent,
    payload: { memeId, fromAgent, toAgent, carriers: before },
  });

  return save(meme);
}

/**
 * 变异一个模因：用 rng 生成新一代（改变适应度 fitness）。
 * @param {{ memeId: string, tick?: number }} input
 * @returns {object} 模因快照
 */
export function mutate({ memeId, tick = 0 } = {}) {
  assertMemeId(memeId);
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('meme.mutate: tick 必须为非负整数');
  }
  const meme = load(memeId);
  if (meme === null) {
    throw new Error('meme.mutate: 模因 "' + memeId + '" 不存在（先 spread）');
  }
  if (meme.extinct) {
    throw new Error('meme.mutate: 模因 "' + memeId + '" 已消亡');
  }
  meme.generation += 1;
  meme.variants += 1;
  meme.fitness = rng.next();

  recorder.eventLog.record({
    tick,
    topic: 'culture.meme.mutate',
    payload: { memeId, generation: meme.generation, fitness: meme.fitness },
  });

  return save(meme);
}

/**
 * 标记一个模因消亡。
 * @param {{ memeId: string, tick?: number }} input
 * @returns {object} 模因快照
 */
export function extinct({ memeId, tick = 0 } = {}) {
  assertMemeId(memeId);
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('meme.extinct: tick 必须为非负整数');
  }
  const meme = load(memeId);
  if (meme === null) {
    throw new Error('meme.extinct: 模因 "' + memeId + '" 不存在');
  }
  meme.extinct = true;

  recorder.eventLog.record({
    tick,
    topic: 'culture.meme.extinct',
    payload: { memeId, carriers: (meme.carriers ?? []).length },
  });

  return save(meme);
}

/**
 * 查询模因。
 * - query()      → 全部模因数组
 * - query(memeId) → 单个模因或 null
 * @param {string} [memeId]
 * @returns {object | object[] | null}
 */
export function query(memeId) {
  if (memeId === undefined) {
    return graph.read({ type: MEME_TYPE }).map((n) => structuredClone(n.data));
  }
  assertMemeId(memeId);
  return load(memeId);
}

/** 查询某模因的传播范围（携带者数量；缺失/消亡返回 0）。 */
export function reach(memeId) {
  assertMemeId(memeId);
  const meme = load(memeId);
  return meme ? (meme.carriers ?? []).length : 0;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
