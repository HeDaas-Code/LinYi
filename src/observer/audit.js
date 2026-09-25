/**
 * truman-town.observer.audit — 决策审计。
 *
 * 回答一个具体问题：**这个 Agent 在某一刻为什么选了这个行动？**
 * 以及：**两次运行（或两个 Agent）的同一时刻，决策分叉在哪里？**
 *
 * 设计取舍：
 * - **追溯（trace）而非复算**：审计不重新跑一遍决策，而是从已记录的
 *   决策日志 + 行动日志 + 事件流里重建"当时可见的证据"。
 *   复算需要完整状态快照，代价高且容易与记录不一致；追溯只读事实。
 * - **证据链必须可引用**：每条结论都带来源（哪个日志、哪个 tick、哪个条目），
 *   否则审计报告就是另一种形式的编造。
 * - **compare 的对象是两条记录，不是两次运行**：差异按 (tick, agentId) 对齐，
 *   逐字段列出不一致项。运行级对比属于 experiment.compare，不重复实现。
 */

import * as graph from '../infra/store/graph.js';
import * as recorder from './recorder/index.js';

/** 一次决策涉及的三个日志类型。 */
const SOURCES = [recorder.decisionLog.TYPE, recorder.actionLog.TYPE, recorder.eventLog.TYPE];

/**
 * 归一化决策内容。
 * 决策日志的 decision 字段**历史上存在两种形状**：主循环写的是纯字符串
 * （decision: decision.action），而测试/其它调用方写的是对象
 * （decision: { action, confidence, thought }）。审计必须两者都认，
 * 否则对真实运行会静默读出 "(未知)"（实测：1292 次决策 100% 读成未知）。
 * @param {unknown} raw
 */
export function describeDecision(raw) {
  if (typeof raw === 'string') {
    return { action: raw === '' ? '(未知)' : raw, confidence: null, thought: null };
  }
  if (raw !== null && typeof raw === 'object') {
    const action = typeof raw.action === 'string' && raw.action !== '' ? raw.action : '(未知)';
    return {
      action,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
      thought: typeof raw.thought === 'string' ? raw.thought : null,
    };
  }
  return { action: '(未知)', confidence: null, thought: null };
}

function entriesAt(tick, agentId) {
  const out = [];
  for (const type of SOURCES) {
    for (const node of graph.read({ type })) {
      const d = node.data ?? {};
      if (d.tick !== tick) continue;
      if (agentId !== undefined && d.agentId !== agentId) continue;
      // 字段名必须按**各日志自己的契约**取：
      // decision-log 写的是 data.decision，event-log 写的是 data.payload，
      // action-log 写的是 data.action/data.detail。
      // 统一按 fallback 链读取会把决策读成 null（实测：trace 取不到 action）。
      const kind = type === recorder.decisionLog.TYPE ? 'decision'
        : type === recorder.actionLog.TYPE ? 'action' : 'event';
      const payload = kind === 'decision'
        ? (d.decision ?? null)
        : kind === 'action'
          ? (d.action ?? null)
          : (d.payload ?? null);
      out.push({
        source: type,
        id: node.id,
        tick: d.tick,
        agentId: d.agentId ?? null,
        kind,
        payload,
        topic: d.topic ?? null,
      });
    }
  }
  out.sort((a, b) => String(a.source).localeCompare(String(b.source)) || String(a.id).localeCompare(String(b.id)));
  return out;
}

/**
 * 追溯某 Agent 在某一 tick 的决策证据链。
 * @param {{ agentId?: string, tick?: number, window?: number }} [input]
 *   window：额外回溯的 tick 数（默认 1，即含前一 tick 的上下文）。
 */
export function trace(input = {}) {
  const agentId = input.agentId;
  if (typeof agentId !== 'string' || agentId === '') {
    throw new TypeError('observer.audit.trace: 需要非空 agentId');
  }
  if (!Number.isInteger(input.tick)) throw new TypeError('observer.audit.trace: 需要整数 tick');
  const window = Number.isInteger(input.window) && input.window >= 0 ? input.window : 1;
  const from = Math.max(0, input.tick - window);

  const chain = [];
  for (let t = from; t <= input.tick; t += 1) {
    for (const e of entriesAt(t, agentId)) chain.push(e);
  }

  const decision = chain.find((e) => e.kind === 'decision' && e.tick === input.tick) ?? null;
  // 证据链：决策之前的行动/事件（它们构成了"当时的状态"），以及决策本身。
  const before = chain.filter((e) => e !== decision);
  if (decision === null) {
    return {
      agentId, tick: input.tick, window, found: false,
      reason: '该 tick 没有决策记录（可能 Agent 已死亡或未参与本 tick）',
      evidence: before, decision: null, chain,
    };
  }
  return {
    agentId,
    tick: input.tick,
    window,
    found: true,
    decision: describeDecision(decision.payload),
    evidence: before,
    chain,
    explanation: '依据 ' + before.length + ' 条前序记录（' + from + '~' + input.tick + ' tick）'
      + '，' + agentId + ' 选择了 ' + describeDecision(decision.payload).action + '。',
  };
}

/**
 * 对比两份记录（通常是两次运行或两个 Agent 的同一批 tick）。
 * 按 (tick, agentId) 对齐，逐字段列出差异。
 *
 * @param {{ a?: Array<object>, b?: Array<object>, labelA?: string, labelB?: string }} [input]
 *   a/b：形如 [{tick, agentId, action, confidence}] 的决策序列。
 */
export function compare(input = {}) {
  const a = Array.isArray(input.a) ? input.a : [];
  const b = Array.isArray(input.b) ? input.b : [];
  const key = (d) => d.tick + '|' + d.agentId;
  const mapA = new Map(a.map((d) => [key(d), d]));
  const mapB = new Map(b.map((d) => [key(d), d]));

  const onlyA = [...mapA.keys()].filter((k) => !mapB.has(k));
  const onlyB = [...mapB.keys()].filter((k) => !mapA.has(k));
  const shared = [...mapA.keys()].filter((k) => mapB.has(k)).sort();

  const divergences = [];
  for (const k of shared) {
    const da = mapA.get(k);
    const db = mapB.get(k);
    const fields = new Set([...Object.keys(da), ...Object.keys(db)]);
    const diffs = [];
    for (const f of [...fields].sort()) {
      if (f === 'tick' || f === 'agentId') continue;
      const va = da[f];
      const vb = db[f];
      // 展平嵌套的 decision 对象：调用方传入的通常是 {tick, agentId, action, confidence}，
      // 而日志里是 {tick, agentId, decision:{action, confidence}}。两者都要能对齐。
      const na = (f === 'decision' && va && typeof va === 'object') ? va : va;
      const nb = (f === 'decision' && vb && typeof vb === 'object') ? vb : vb;
      if (JSON.stringify(na) !== JSON.stringify(nb)) diffs.push({ field: f, a: na ?? null, b: nb ?? null });
    }
    if (diffs.length > 0) {
      const [tick, agentId] = k.split('|');
      divergences.push({ tick: Number(tick), agentId, diffs });
    }
  }

  const total = shared.length;
  return {
    labelA: input.labelA ?? 'A',
    labelB: input.labelB ?? 'B',
    compared: total,
    identical: total - divergences.length,
    diverged: divergences.length,
    divergenceRate: total > 0 ? divergences.length / total : 0,
    onlyA: onlyA.length,
    onlyB: onlyB.length,
    firstDivergence: divergences.length > 0 ? divergences[0] : null,
    divergences,
  };
}

export function __reset() { /* 审计为只读派生，无自有状态 */ }
