/**
 * truman-town.agent.traits.evolution — 特质演化 / Trait Evolution
 *
 * 让 tag 发生小概率变异（mutate，供子代遗传）并随时间缓慢漂移（drift，
 * 随生存压力/社交/创伤经历调整权重）。drift 为确定性单调漂移（权重朝目标
 * 夹逼、恒为正、有界）；mutate 为确定性伪随机扰动（以 agentId/tags 为种子，
 * 不消耗全局 rng，保证主循环随机流稳定、测试可复现），提供可遗传变异。
 *
 * RPC：agent.traits.evolution.mutate / drift
 */

import * as tagsetStore from './tagset/store.js';

const WEIGHT_MIN = 0.05;
const WEIGHT_MAX = 10;

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('traits.evolution: agentId 必须为非空字符串');
  }
}

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clampWeight(w) {
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, w));
}

/** FNV-1a 字符串哈希 → [0,1) 确定性伪随机数（不消耗全局 rng）。 */
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * 确定性变异：以 rate 概率扰动每个标签权重（×0.8~1.25），保持 key 不变
 * （不改变 50 标签结构）。以 agentId（或 tags 下标）为种子，可复现。
 * @param {{ agentId?: string, tags?: Array<{key,weight}>, rate?: number }} [input]
 * @returns {{ tags: Array<{key,weight}>, mutated: number }}
 */
export function mutate(input = {}) {
  const rate = num(input.rate, 0.02);
  let source;
  if (Array.isArray(input.tags)) {
    source = input.tags;
  } else if (typeof input.agentId === 'string' && input.agentId !== '') {
    const tagset = tagsetStore.get(input.agentId);
    source = tagset === null ? [] : tagset.tags;
  } else {
    source = [];
  }
  const seed = typeof input.agentId === 'string' && input.agentId !== '' ? input.agentId : 'mutate';
  let mutated = 0;
  const tags = source.map((t, idx) => {
    const h = hash01(seed + ':' + t.key + ':' + idx);
    if (h >= rate) return { key: t.key, weight: t.weight };
    mutated += 1;
    const factor = 0.8 + h * 0.45;
    return { key: t.key, weight: clampWeight(t.weight * factor) };
  });
  if (typeof input.agentId === 'string' && input.agentId !== '') {
    tagsetStore.upsert(input.agentId, tags);
  }
  return { tags, mutated };
}

/**
 * 确定性漂移：按信号把相关特质权重缓慢推向目标。signal 为各特质的目标权重
 * （如生存压力高→resilient/cautious 上调），weight 以 rate 线性逼近目标。
 * @param {{ agentId: string, signals?: Record<string, number>, rate?: number }} input
 * @returns {{ agentId: string, tags: Array<{key,weight}>, drifted: number }}
 */
export function drift(input = {}) {
  assertAgentId(input.agentId);
  const rate = num(input.rate, 0.05);
  const signals = (input.signals && typeof input.signals === 'object') ? input.signals : {};
  const tagset = tagsetStore.get(input.agentId);
  if (tagset === null) return { agentId: input.agentId, tags: [], drifted: 0 };
  let drifted = 0;
  const tags = tagset.tags.map((t) => {
    const target = signals[t.key];
    if (typeof target !== 'number' || !Number.isFinite(target)) return { key: t.key, weight: t.weight };
    const next = clampWeight(t.weight + (target - t.weight) * rate);
    if (Math.abs(next - t.weight) > 1e-12) drifted += 1;
    return { key: t.key, weight: next };
  });
  tagsetStore.upsert(input.agentId, tags);
  return { agentId: input.agentId, tags, drifted };
}

/** 复位依赖（tagset store 由 agent.__reset 统一复位）。 */
export function __reset() {}
