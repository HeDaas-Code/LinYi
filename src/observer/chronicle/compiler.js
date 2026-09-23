/**
 * truman-town.observer.chronicle.compiler — 编年编译器
 *
 * 把 recorder 写入的原始决策/行为/事件日志，按 tick 分桶编译为
 * 时间组织的编年志：提供 compile()（读取并编译）与 bucket()（纯分桶）两个入口。
 */

import * as graph from '../../infra/store/graph.js';
import * as recorder from '../recorder/index.js';

const KIND_BY_TYPE = {
  [recorder.decisionLog.TYPE]: 'decision',
  [recorder.actionLog.TYPE]: 'action',
  [recorder.eventLog.TYPE]: 'event',
};

function toEntry(node) {
  const data = node && typeof node.data === 'object' ? node.data : {};
  return {
    kind: KIND_BY_TYPE[node?.type] ?? 'unknown',
    id: typeof node?.id === 'string' ? node.id : '',
    tick: data.tick,
    seq: typeof data.seq === 'number' ? data.seq : Number.MAX_SAFE_INTEGER,
    ts: typeof data.ts === 'number' ? data.ts : 0,
    agentId: typeof data.agentId === 'string' ? data.agentId : null,
    data,
  };
}

function byTickThenSeq(a, b) {
  const ta = typeof a?.tick === 'number' ? a.tick : Infinity;
  const tb = typeof b?.tick === 'number' ? b.tick : Infinity;
  if (ta !== tb) return ta - tb;
  const sa = typeof a?.seq === 'number' ? a.seq : Infinity;
  const sb = typeof b?.seq === 'number' ? b.seq : Infinity;
  return sa - sb;
}

/**
 * 把日志条目按 tick 分桶。
 * @param {Array<{tick?: number}>} entries 日志条目
 * @param {object} [opts]
 * @param {number} [opts.size=1] 每个桶覆盖的 tick 数量
 * @returns {Array<{startTick: number, endTick: number, entries: Array}>}
 *   按 (startTick, seq) 升序排列的桶；桶内条目已按 (tick, seq) 排序
 */
export function bucket(entries, { size = 1 } = {}) {
  if (!Array.isArray(entries)) {
    throw new TypeError('chronicle.bucket: entries 必须为数组');
  }
  if (!Number.isInteger(size) || size < 1) {
    throw new TypeError('chronicle.bucket: size 必须为正整数');
  }
  const sorted = [...entries].sort(byTickThenSeq);
  const buckets = [];
  let current = null;
  for (const entry of sorted) {
    const tick = typeof entry?.tick === 'number' ? entry.tick : null;
    if (tick === null) continue; // 无 tick 的条目不参与分桶
    const startTick = Math.floor(tick / size) * size;
    if (current === null || current.startTick !== startTick) {
      current = { startTick, endTick: startTick + size - 1, entries: [] };
      buckets.push(current);
    }
    current.entries.push(entry);
  }
  return buckets;
}

/**
 * 读取原始日志并编译为按时间组织的编年志。
 * @param {object} [options]
 * @param {number} [options.fromTick] 起始 tick（含）
 * @param {number} [options.toTick] 结束 tick（含）
 * @param {string} [options.agentId] 只保留该主体的决策与行为
 * @param {number} [options.bucketSize=1] 时间桶大小（tick 数）
 * @returns {object} { compiledAt, startTick, endTick, bucketSize, counts, buckets, entries }
 */
export function compile(options = {}) {
  const { fromTick, toTick, agentId, bucketSize = 1 } = options ?? {};
  if (!Number.isInteger(bucketSize) || bucketSize < 1) {
    throw new TypeError('chronicle.compile: bucketSize 必须为正整数');
  }
  const nodes = [
    ...graph.read({ type: recorder.decisionLog.TYPE }),
    ...graph.read({ type: recorder.actionLog.TYPE }),
    ...graph.read({ type: recorder.eventLog.TYPE }),
  ];
  const filtered = nodes.map(toEntry).filter((entry) => {
    if (typeof entry.tick !== 'number') return false;
    if (typeof fromTick === 'number' && entry.tick < fromTick) return false;
    if (typeof toTick === 'number' && entry.tick > toTick) return false;
    if (agentId !== undefined && entry.agentId !== agentId) return false;
    return true;
  });
  const counts = { decision: 0, action: 0, event: 0 };
  let minTick = null;
  let maxTick = null;
  for (const entry of filtered) {
    if (typeof counts[entry.kind] === 'number') counts[entry.kind] += 1;
    if (typeof entry.tick === 'number') {
      if (minTick === null || entry.tick < minTick) minTick = entry.tick;
      if (maxTick === null || entry.tick > maxTick) maxTick = entry.tick;
    }
  }
  counts.total = filtered.length;
  const buckets = bucket(filtered, { size: bucketSize });
  const entries = buckets.flatMap((b) => b.entries);
  return {
    compiledAt: Date.now(),
    startTick: minTick,
    endTick: maxTick,
    bucketSize,
    counts,
    buckets,
    entries,
  };
}
