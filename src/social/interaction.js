/**
 * truman-town.social.interaction — 双向社会互动 / Bilateral Social Interaction
 *
 * 用户需求原文（t13）：实现**结构化请求 → 接受/拒绝 → 承诺 → 履约/违约 → 信任变化**；
 * 自然语言只作为可选渲染，必须经过**世界事实校验**后才能影响关系、声誉与后续行为；
 * **不以增加帖子数量代替互动**。
 *
 * ---------------------------------------------------------------------------
 * 为什么需要这一层（修复前的真实状态，均为复跑实测）
 *
 * 1) 社会互动是**单向且无回应**的。socialize 只是
 *    `friendship.update({delta:0.05})`——接收方没有同意、也没有否决；
 *    court 只是往 pendingCourts 里塞一个 id，被追求方除了"接受"之外没有第二种回应。
 *    实测（30 居民 120 tick）：action-log 里 accept 出现 0 次，
 *    所以"表白→接受"这条唯一的双向路径在生产里从未跑通。
 * 2) 承诺与履约**根本不存在**：没有任何模块记录"我答应给你 X"，
 *    因此违约、失信、信任下降这些社会事实无从产生。
 * 3) 信任不是独立事实：友谊强度与恋爱强度互相不可见，
 *    声誉只有"你做过什么"（发帖/交易），没有"你对我守不守信"。
 * 4) 文字与世界事实无关联：帖子正文由处境数值拼装，但**没有任何校验**——
 *    一个从未参与过任何事件的人，写什么都会被当作事实被读取。
 *
 * ---------------------------------------------------------------------------
 * 设计契约（三条硬约束）
 *
 * - **结构化优先**：所有互动都是 `{type, from, to, terms}` 的记录，落图可查、可入档。
 *   自然语言（naturalLanguage）是**可选渲染**，缺失不影响任何判定。
 * - **事实校验门**：claims 里每一条 `{key, value}` 都必须由 `facts.js` 的读写器
 *    用**世界状态**证实。未证实的 claim 不算数、不写关系、不写声誉，
 *    并被显式记账（`rejectedClaims`）——不静默丢弃，也不"假装信了"。
 * - **孤立文本不入账**：`fromText()` 从自由文本里**读**结构化事实，
 *    读不出东西就返回 null。它不会因为"提到了某人"就凭空建关系：
 *    这与"发帖数量驱动社交"是同一类伪互动，必须杜绝。
 */

import * as graph from '../infra/store/graph.js';
import * as identity from '../infra/identity.js';
import * as facts from './facts.js';
import * as friendship from './relationship/friendship.js';
import * as romance from './relationship/romance.js';
import * as reputation from './reputation.js';
import * as edges from './graph/edges.js';
import * as eventLog from '../observer/recorder/event-log.js';

const TYPE = 'social.interaction';
const PREFIX = 'interaction:';
/**
 * 每对的**待回应请求**上限与**未结承诺**上限（分开计）。
 *
 * 必须分开：请求是"说句话等回复"，承诺是"欠着一份债"，两者的合理存量差一个量级。
 * 混在一起计时，同一对之间反复的寒暄会把额度占满，
 * 于是"承诺"这一整类社会事实根本建立不起来（实测独立计数前 promise 仅 1 次）。
 */
const MAX_PENDING_PER_PAIR = 3;
const MAX_OPEN_PROMISES_PER_PAIR = 2;

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('interaction: ' + label + ' 必须为非空字符串');
  }
}

function assertTick(tick) {
  if (!Number.isInteger(tick) || tick < 0) {
    throw new TypeError('interaction: tick 必须为非负整数');
  }
}

function nodeId(id) {
  return PREFIX + id;
}

/** @type {Map<string, object>} 互动与承诺记录（id → record）。 */
const byId = new Map();
/** 上次校验的 graph 复位代数。 */
let lastGeneration = -1;

/**
 * 从图重建索引。
 *
 * 与 reputation/episodic 的 ensureFresh 同款：graph 被 `__reset`/`__restore` 后
 * 内存索引必须**从图重建**而不是简单清空——只清空会让"图里明明有记录、
 * 查询却返回空"，那是静默数据丢失（t3 已在该类缺陷上踩过一次）。
 */
function rebuildFromGraph() {
  byId.clear();
  for (const node of graph.read({ type: TYPE })) {
    const d = node.data;
    if (d && typeof d.interactionId === 'string' && d.interactionId !== '') {
      byId.set(d.interactionId, d);
    }
  }
}

function ensureFresh() {
  const gen = graph.__generation();
  if (gen !== lastGeneration) {
    rebuildFromGraph();
    lastGeneration = gen;
  }
}

function save(record) {
  byId.set(record.interactionId, record);
  graph.write({ id: nodeId(record.interactionId), type: TYPE, data: record });
  return structuredClone(record);
}

/** 排序对键：a-b 与 b-a 属于同一对（与 friendship/romance 的取向一致）。 */
function pairKey(a, b) {
  return a < b ? a + ':' + b : b + ':' + a;
}

/** 人类可读的互动类型目录（唯一事实来源；传入未知 type 直接报错，不静默降级）。 */
export const INTERACTION_TYPES = Object.freeze({
  request: '请求（可被接受或拒绝）',
  promise: '承诺（承诺方须在未来履约）',
  fulfill: '履约（兑现此前的承诺）',
  violate: '违约（未能兑现承诺）',
  socialize: '社交（双向，接收方可接受/拒绝）',
  court: '求偶（可能被接受或拒绝）',
});

function assertType(type) {
  if (!Object.prototype.hasOwnProperty.call(INTERACTION_TYPES, type)) {
    throw new RangeError('interaction: 未知互动类型「' + String(type) + '」（可用：'
      + Object.keys(INTERACTION_TYPES).join(' / ') + '）');
  }
  return type;
}

/**
 * 世界事实校验：逐条 claim 用 facts 读写器核实。
 *
 * @param {string} claimant 声明者
 * @param {object} world 世界视图（见 facts.collect）
 * @param {Array<{key: string, value: unknown}>} claims
 * @returns {{ verified: Array<object>, rejected: Array<object> }}
 */
export function verifyClaims(claimant, world, claims) {
  const list = Array.isArray(claims) ? claims : [];
  const verified = [];
  const rejected = [];
  for (const c of list) {
    if (c === null || typeof c !== 'object' || typeof c.key !== 'string' || c.key === '') {
      rejected.push({ key: c === null || typeof c !== 'object' ? null : c.key ?? null, reason: 'malformed_claim' });
      continue;
    }
    // subject 缺省是声明者本人；声称"**对方**是医生"这类关于第三方的声明必须显式给 subject，
    // 否则会拿声明者自己的状态去核对，把真话判成假话（这正是初版 court 的缺陷）。
    const subject = typeof c.subject === 'string' && c.subject !== '' ? c.subject : claimant;
    const res = facts.verify({ key: c.key, value: c.value, claimant, subject }, world);
    if (res.verified) {
      verified.push({ key: c.key, subject, value: c.value === undefined ? res.asserted : c.value, fact: res.asserted });
    } else {
      rejected.push({ key: c.key, subject, value: c.value, reason: res.reason });
    }
  }
  return { verified, rejected };
}

// ---------------------------------------------------------------------------
// 信任
// ---------------------------------------------------------------------------

/**
 * 信任读数：由**可核查的互动历史**派生，不是独立随机量。
 *
 * trust = 0.5（中性基线）
 *       + 0.5 × (履约数 - 0.5×违约数) / (履约数 + 违约数 + 1)   ← 有界，履约率驱动
 *       - 0.25 × 未结承诺压力                                   ← 欠得越多越不可信
 * 范围夹在 [0,1]。无任何历史时恰好为 0.5（不凭空怀疑，也不凭空信任）。
 *
 * @param {{ a?: string, b?: string, holder?: string, other?: string }} input
 * @returns {{ holder: string, other: string, trust: number, fulfilled: number,
 *             violated: number, pending: number, interactions: number }}
 */
export function trust(input = {}) {
  const holder = input.holder ?? input.a;
  const other = input.other ?? input.b;
  assertId(holder, 'holder');
  assertId(other, 'other');
  ensureFresh();
  let fulfilled = 0;
  let violated = 0;
  let pending = 0;
  let interactions = 0;
  for (const rec of byId.values()) {
    if (!rec || !Array.isArray(rec.parties) || !rec.parties.includes(holder) || !rec.parties.includes(other)) continue;
    interactions += 1;
    if (rec.type === 'promise' && rec.status === 'open') pending += 1;
    // 结算记录里 `from` 就是**承诺方**（谁欠的谁去履约/违约）。
    // 早先按 `by` 字段取，而记录里根本没有该字段，于是履约与违约恒不计数、
    // 信任永远停在 0.5——"信任变化"沦为一句空话（实测 20 条结算后仍为中性）。
    if (rec.type === 'fulfill' && rec.from === other) fulfilled += 1;
    if (rec.type === 'violate' && rec.from === other) violated += 1;
  }
  const resolved = fulfilled + violated;
  const reliability = (fulfilled - 0.5 * violated) / (resolved + 1);
  const pressure = pending / (pending + 2);
  const value = Math.max(0, Math.min(1, 0.5 + 0.5 * reliability - 0.25 * pressure));
  return { holder, other, trust: value, fulfilled, violated, pending, interactions };
}

/** 读取两个方向各自的信任（互动是**双向**：你对我的信任与我对你的信任分别记录）。 */
export function trustBetween(a, b) {
  assertId(a, 'a');
  assertId(b, 'b');
  return { aToB: trust({ holder: a, other: b }), bToA: trust({ holder: b, other: a }) };
}

// ---------------------------------------------------------------------------
// 发起互动
// ---------------------------------------------------------------------------

/**
 * 发起一次结构化互动。
 *
 * 语义分支（按类型）：
 * - socialize/court/request → status='pending'，等待接收方 accept/reject。
 *   **发起方不能替接收方决定**：发起只写 pending，不写任何"已建立关系"。
 * - promise  → status='open'，承诺方欠对方一个待履约事项（terms 描述"欠什么/多少"）。
 * - fulfill/violate → 结算一条已存在的承诺（promiseId 必填且必须是对方的 open 承诺）。
 *
 * @param {{ type: string, from: string, to: string, terms?: object, claims?: Array,
 *           tick?: number, naturalLanguage?: string|null }} input
 * @returns {object} 互动记录
 */
export function propose(input = {}) {
  const type = assertType(input.type);
  const from = input.from;
  const to = input.to;
  assertId(from, 'from');
  assertId(to, 'to');
  if (from === to) throw new TypeError('interaction.propose: 不能与自己互动');
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  assertTick(tick);
  ensureFresh();

  // 有界性：待回应请求与未结承诺各自设限，防止长跑下无界增长。
  const samePair = [...byId.values()].filter((r) => pairKey(r.from, r.to) === pairKey(from, to));
  if (type === 'promise') {
    const openPromises = samePair.filter((r) => r.type === 'promise' && r.status === 'open').length;
    if (openPromises >= MAX_OPEN_PROMISES_PER_PAIR) {
      return { ok: false, reason: 'too_many_open_promises', open: openPromises };
    }
  } else if (type !== 'fulfill' && type !== 'violate') {
    const pending = samePair.filter((r) => r.status === 'pending').length;
    if (pending >= MAX_PENDING_PER_PAIR) {
      return { ok: false, reason: 'too_many_pending', pending };
    }
  }

  // 承诺的结算类互动必须指向一条**真实存在且仍开放**的承诺。
  let promiseId = null;
  if (type === 'fulfill' || type === 'violate') {
    promiseId = typeof input.promiseId === 'string' ? input.promiseId : null;
    const promise = promiseId === null ? null : byId.get(promiseId);
    if (promise === null || promise === undefined) {
      return { ok: false, reason: 'no_such_promise' };
    }
    if (promise.type !== 'promise' || promise.status !== 'open') {
      return { ok: false, reason: 'promise_not_open' };
    }
    // 只有**承诺方**（promise.from）能履约或违约；且结算者必须是本次的 from。
    if (promise.from !== from) return { ok: false, reason: 'not_the_promisor' };
  }

  // 事实校验门：claims 必须由世界状态证实，未证实的不写关系、不写声誉。
  const world = facts.collect({ participants: [from, to] });
  const check = verifyClaims(from, world, input.claims);

  const interactionId = identity.next('interaction');
  const record = {
    interactionId,
    type,
    from,
    to,
    parties: [from, to],
    pairKey: pairKey(from, to),
    terms: input.terms === undefined ? null : structuredClone(input.terms),
    tick,
    promises: type === 'promise' ? (input.terms ?? null) : null,
    promiseId,
    // 状态机：pending（等待回应）/ open（承诺未结）/ accepted / rejected / fulfilled / violated
    status: type === 'promise' ? 'open'
      : (type === 'fulfill' ? 'fulfilled' : (type === 'violate' ? 'violated' : 'pending')),
    response: null,
    claims: check.verified,
    rejectedClaims: check.rejected,
    verifiedFacts: check.verified.map((c) => ({ key: c.key, fact: c.fact })),
    // 自然语言是**可选渲染**：只做存证，不参与任何判定。
    naturalLanguage: typeof input.naturalLanguage === 'string' && input.naturalLanguage !== ''
      ? input.naturalLanguage : null,
  };
  const saved = save(record);

  if (type === 'promise') {
    eventLog.record({ tick, topic: 'social.promise.made', agentId: from,
      payload: { interactionId, to, terms: record.terms } });
  } else if (type === 'fulfill' || type === 'violate') {
    const promise = byId.get(promiseId);
    promise.status = type === 'fulfill' ? 'fulfilled' : 'violated';
    promise.resolvedAt = tick;
    graph.write({ id: nodeId(promiseId), type: TYPE, data: promise });
    // 履约/违约是**双向事实**：写关系、写声誉（声誉只由已核实的事实驱动）。
    applyConsequence({ record: saved, promise, tick });
  } else {
    eventLog.record({ tick, topic: 'social.interaction.proposed', agentId: from,
      payload: { interactionId, type, to, rejectedClaims: record.rejectedClaims } });
  }
  return { ok: true, ...saved };
}

/**
 * 回应一个待决互动（**由接收方自己调用**，发起方不能代答）。
 * @param {{ interactionId: string, respondent: string, accept: boolean, tick?: number }} input
 * @returns {object} 回应后的记录
 */
export function respond(input = {}) {
  ensureFresh();
  const interactionId = input.interactionId;
  assertId(interactionId, 'interactionId');
  const respondent = input.respondent;
  assertId(respondent, 'respondent');
  const rec = byId.get(interactionId);
  if (rec === undefined) return { ok: false, reason: 'no_such_interaction' };
  if (rec.status !== 'pending') return { ok: false, reason: 'already_resolved:' + rec.status };
  if (rec.to !== respondent) return { ok: false, reason: 'not_the_recipient' };

  const tick = Number.isInteger(input.tick) ? input.tick : rec.tick;
  const accept = input.accept === true;
  const next = { ...rec };
  next.status = accept ? 'accepted' : 'rejected';
  next.response = { at: tick, accept, by: respondent };
  const saved = save(next);

  eventLog.record({ tick, topic: accept ? 'social.interaction.accepted' : 'social.interaction.rejected',
    agentId: respondent, payload: { interactionId, type: rec.type, from: rec.from, to: rec.to } });

  if (accept) applyConsequence({ record: saved, promise: null, tick });
  return { ok: true, ...saved };
}

/**
 * 结算后果：只由**已发生的结构化事实**驱动，写入关系、声誉与关系图。
 *
 * 明确不做的事：不接受则**不**建关系、不涨声誉、不写社交边。
 * 修复前 socialize 无条件 +0.05 友谊并建边，"被社交"的一方没有任何否决权。
 */
function applyConsequence({ record, promise = null, tick }) {
  const { from, to, type } = record;
  if (type === 'fulfill' || type === 'violate') {
    const good = type === 'fulfill';
    friendship.update({ a: from, b: to, delta: good ? 0.12 : -0.2, note: type + ':' + record.promiseId });
    reputation.update({ agentId: from, delta: good ? 2 : -6, reason: 'promise_' + (good ? 'fulfilled' : 'violated'), tick });
    edges.create({ a: from, b: to, type: 'obligation', weight: good ? 0.8 : 0.2,
      note: (good ? '履约' : '违约') + ':' + String(promise?.terms?.what ?? '') });
    eventLog.record({ tick, topic: 'social.promise.' + (good ? 'fulfilled' : 'violated'), agentId: from,
      payload: { interactionId: record.interactionId, promiseId: record.promiseId, to } });
    return;
  }
  if (type === 'promise') return; // 承诺本身不改变关系；它建立的是**待履约义务**。
  // socialize / court / request 的接受：写关系与关系边（双向事实已由 respond 确认）。
  if (type === 'socialize') {
    friendship.update({ a: from, b: to, delta: 0.08, note: 'mutual:' + record.interactionId });
    friendship.update({ a: to, b: from, delta: 0.08, note: 'mutual:' + record.interactionId });
    edges.create({ a: from, b: to, type: 'friendship', weight: 0.4, note: 'mutual_socialize' });
  } else if (type === 'court') {
    // 恋爱纽带由 romance 自己的状态机推进（none → proposed → paired）。
    // 互动层负责"谁答应了谁"，romance 负责"纽带处于什么状态"——两层职责不重叠。
    // 这里不能直接调 accept：本层没有走过 romance.propose，
    // 直接 accept 会抛"没有待接受的表白"（实测主循环因此中断）。
    pairThroughRomance(from, to);
    edges.create({ a: from, b: to, type: 'romance', weight: 0.9, note: 'court_accepted' });
  } else if (type === 'request') {
    edges.create({ a: from, b: to, type: 'request', weight: 0.5, note: 'accepted' });
  }
}

/**
 * t13：到期的承诺必须**被结算**。
 *
 * 承诺的 terms.dueTick 是一个真正的期限：过了期限还没交付，就是违约——
 * 这是**事实**，不是别人的选择。若不自动结算，未结承诺会永久堆积
 * （实测 120 tick 后仍有 6 条 open），"承诺"就退化成一个只增不减的计数，
 * 信任读数也被永久压在低位而失真。
 *
 * 交付过的承诺早已被 fulfill 置为 fulfilled，因此这里只处理**过期且仍开放**的。
 * 幂等：同一条承诺只会被结算一次（状态从 open 变 violated 后不再入选）。
 *
 * @param {{ tick: number, limit?: number }} input
 * @returns {{ overdue: Array<{interactionId: string, from: string, to: string, days: number}> }}
 */
export function settleOverdue(input = {}) {
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  ensureFresh();
  const overdue = [];
  const limit = Number.isInteger(input.limit) && input.limit > 0 ? input.limit : 16;
  for (const rec of [...byId.values()]) {
    if (rec.type !== 'promise' || rec.status !== 'open') continue;
    const due = rec.terms?.dueTick;
    if (!Number.isInteger(due) || tick <= due) continue;
    const res = propose({
      type: 'violate', from: rec.from, to: rec.to, tick, promiseId: rec.interactionId,
      terms: { reason: 'overdue', dueTick: due },
    });
    if (res.ok === true) overdue.push({ interactionId: rec.interactionId, from: rec.from, to: rec.to, days: tick - due });
    if (overdue.length >= limit) break;
  }
  return { overdue };
}

/**
 * t26：**沉默即拒绝** —— 超过时限仍未回应的待决互动，由时间本身结案。
 *
 * 为什么需要它：t13 给了接收方「同意才建关系」的否决权，却**没给「不回应」任何后果**，
 * 于是等待是无界的。实测 seed42/20tick/12 人：4 条 socialize 永久 pending，
 * 最久的等到第 8 tick 仍在等；seed7 更久（9 tick 且仍在等）。
 * 「永远挂着」不是中立——它让发起方永远不知道该不该另找别人，
 * 也让「待决互动」变成一个只增不减的计数。
 *
 * 这与 t13 对承诺的处理是同一个道理：承诺过了 dueTick 没交付就是违约，
 * **时间本身是事实**。请求也一样——过了时限没有答复就是「没答应」。
 * 因此这里写的是**拒绝**，与「同意才建 friendship 边」完全一致：
 * 不写关系、不写声誉、不建边（applyConsequence 只在 accept 时被调用）。
 *
 * 与 settleOverdue 的分工：那个管**承诺**（open → violated），这个管**待决互动**
 * （pending → rejected）。两者都是「时间到了就结案」，但结的是不同的状态机。
 *
 * 幂等：状态从 pending 变 rejected 后不再入选。
 *
 * @param {{ tick: number, maxWait?: number }} input
 * @returns {{ stale: Array<object>, count: number }}
 */
export function settleStaleResponses(input = {}) {
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  ensureFresh();
  const maxWait = Number.isInteger(input.maxWait) && input.maxWait > 0 ? input.maxWait : 10;
  const stale = [];
  for (const rec of [...byId.values()]) {
    if (rec.status !== 'pending') continue;
    const waited = tick - (Number.isInteger(rec.tick) ? rec.tick : tick);
    if (waited < maxWait) continue;
    const next = { ...rec };
    next.status = 'rejected';
    // reason 写进 response：**为什么**被拒是可查的（这里是「没答复」而非「对方说不」）。
    next.response = { at: tick, accept: false, by: rec.to, reason: 'no_response' };
    const saved = save(next);
    eventLog.record({ tick, topic: 'social.interaction.timed_out', agentId: rec.to,
      payload: { interactionId: rec.interactionId, type: rec.type, from: rec.from, to: rec.to, waited } });
    stale.push(saved);
  }
  return { stale, count: stale.length };
}

/**
 * 把双方推进到 paired：按 romance 的**合法状态转移**走（none/broken → proposed → paired）。
 * 任一步失败都不会让互动失败——互动的成立由自己的记录保证，
 * romance 只是关系基质的投影，投影失败不该反噬事实。
 */
function pairThroughRomance(from, to) {
  try {
    const st = romance.state({ a: from, b: to });
    if (st === 'none' || st === 'broken') romance.propose({ from, to });
    if (romance.state({ a: from, b: to }) === 'proposed') romance.accept({ from, to });
  } catch { /* 已配对/基质不可用：互动记录本身已成立 */ }
}

/**
 * 从**自由文本**中读出结构化 claim。
 *
 * 这是"自然语言可选渲染"的入口，边界写死在这里：
 * - 只做**事实抽取**，抽不出已知事实就返回 null；
 * - 不因为"提到了某人"就建关系——那是把文本当事实，本任务要杜绝的正是这类伪互动。
 * - 抽出的值仍要过 propose 的事实校验门，本函数不构成任何信任。
 *
 * @param {{ text: string, speaker?: string, to?: string }} input
 * @returns {{ type: string, from: string, to: string, claims: Array<{key:string,value:unknown}> }|null}
 */
export function fromText(input = {}) {
  const text = typeof input.text === 'string' ? input.text : '';
  const speaker = input.speaker;
  const to = input.to;
  assertId(speaker, 'speaker');
  assertId(to, 'to');
  const claims = [];
  // 中文/英文字面量抽取：只认 facts 目录里已知的 key。
  for (const spec of facts.catalog()) {
    for (const p of spec.patterns) {
      const m = p.exec(text);
      if (m === null) continue;
      const value = spec.parse === undefined ? true : spec.parse(m);
      if (value !== undefined) claims.push({ key: spec.key, value });
      break;
    }
  }
  if (claims.length === 0) return null;
  return { type: 'socialize', from: speaker, to, claims };
}

// ---- 查询面 ----

/** 读取单条互动。 */
export function get(interactionId) {
  assertId(interactionId, 'interactionId');
  ensureFresh();
  const r = byId.get(interactionId);
  return r === undefined ? null : structuredClone(r);
}

/** 列出互动（可按双方 / 类型 / 状态过滤）。 */
export function list(options = {}) {
  ensureFresh();
  let out = [...byId.values()];
  if (typeof options.party === 'string') out = out.filter((r) => r.parties.includes(options.party));
  if (typeof options.type === 'string') out = out.filter((r) => r.type === options.type);
  if (typeof options.status === 'string') out = out.filter((r) => r.status === options.status);
  if (typeof options.a === 'string' && typeof options.b === 'string') {
    out = out.filter((r) => pairKey(r.from, r.to) === pairKey(options.a, options.b));
  }
  return out
    .sort((x, y) => (x.tick - y.tick) || x.interactionId.localeCompare(y.interactionId))
    .map((r) => structuredClone(r));
}

/** 某主体**待回应**的互动（接收方视角，供决策与观测使用）。 */
export function pendingFor(agentId) {
  assertId(agentId, 'agentId');
  return list({ party: agentId, status: 'pending' }).filter((r) => r.to === agentId);
}

/** 某主体**未结**的承诺（承诺方视角）。 */
export function openPromises(agentId) {
  assertId(agentId, 'agentId');
  return list({ party: agentId, type: 'promise', status: 'open' }).filter((r) => r.from === agentId);
}

/** 某主体**被欠**的承诺（受诺方视角）。 */
export function owedTo(agentId) {
  assertId(agentId, 'agentId');
  return list({ type: 'promise', status: 'open' }).filter((r) => r.to === agentId);
}

/** 有界统计（供观测与验收）。 */
export function stats() {
  ensureFresh();
  const all = [...byId.values()];
  const count = (fn) => all.filter(fn).length;
  return {
    total: all.length,
    accepted: count((r) => r.status === 'accepted'),
    rejected: count((r) => r.status === 'rejected'),
    pending: count((r) => r.status === 'pending'),
    promises: count((r) => r.type === 'promise'),
    fulfilled: count((r) => r.type === 'fulfill'),
    violated: count((r) => r.type === 'violate'),
    openPromises: count((r) => r.type === 'promise' && r.status === 'open'),
    // 被事实门拦下的声明数：这是"文本不构成事实"的可观测证据，不是内部细节。
    rejectedClaims: all.reduce((n, r) => n + (Array.isArray(r.rejectedClaims) ? r.rejectedClaims.length : 0), 0),
    verifiedClaims: all.reduce((n, r) => n + (Array.isArray(r.claims) ? r.claims.length : 0), 0),
  };
}

// ---- 持久化 ----

export function __snapshot() {
  ensureFresh();
  return { byId: [...byId.entries()].map(([k, v]) => [k, structuredClone(v)]) };
}

export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('interaction.__restore: 状态必须为对象');
  }
  byId.clear();
  for (const pair of (Array.isArray(data.byId) ? data.byId : [])) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    if (typeof pair[0] !== 'string' || pair[0] === '') continue;
    byId.set(pair[0], structuredClone(pair[1]));
  }
  lastGeneration = graph.__generation();
  return { interactions: byId.size };
}

/** 复位（图由上层 graph.__reset 负责；这里清派生索引并让代数失效）。 */
export function __reset() {
  byId.clear();
  lastGeneration = -1;
}
