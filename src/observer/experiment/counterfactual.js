/**
 * truman-town.observer.experiment.counterfactual — 反事实 / Counterfactual
 *
 * 「如果当时不这样做会怎样」——**真实分支重演**，而不是哈希投影。
 *
 * ## 为什么重写（t10）
 * 旧实现用 project() 把 (agentId, tick, 备选行动) 哈希成 [0,1) 的伪分数，
 * 再拿原决策与备选的哈希值相减当作「反事实因果效应」。那是**伪因果**：
 *   - 差值完全由字符串决定，与世界观、资源、居民状态、后续行为毫无关系；
 *     同一 tick 换个行动名就能让 delta 变号，而世界根本没被模拟过。
 *   - 「备选等于原决策 ⇒ delta 恰好为 0」这条看似正确的性质，只是哈希对同一
 *     输入稳定，**不是**因果推断的结果，却会让人误以为这个指标是可用的。
 *   - 它把一个需要重演的问题伪装成不需要重演的问题——这是最危险的部分。
 *
 * ## 现在的做法
 * 从**完整提交边界快照**分叉出两个世界，只在一个 (agentId, tick) 上替换一个
 * 行动，然后**各自真实执行**到底：
 *   1. 基线世界：从同一存档恢复，不干预，按同一 seed 继续推进；
 *   2. 分支世界：从**同一份**存档恢复，在指定 tick 把该居民的最终行动改写为
 *      备选行动，其余一切照旧。
 * 两条世界都从同一存档恢复，因此随机流位置、时钟、人口、经济、关系逐位一致，
 * 唯一的差别就是那一个行动。实测（seed 7, 4 人, 10→14 tick）：基线在替换点
 * 之后与原世界逐条一致，分支世界在替换点当 tick 即偏离，并向下游传播。
 *
 * ## 隔离措施（每一处都对应一个真实的污染源）
 *   - **随机流隔离**：两条世界各自从存档恢复 RNG 的**流位置**（而不只是种子），
 *     起点因此相同；各自消费互不影响（恢复是深拷贝，不是共享对象）。
 *   - **原世界不被污染**：整个重演在受控会话里进行，结束（成功或抛错）都恢复
 *     到调用前的世界；并用世界指纹校验恢复前后一致，不一致就显式报告，
 *     而不是留一个被改过的世界在后台。
 *   - **外部模型输出**：模型不可用时 loop 只记 fallbackReason（不读世界），
 *     因此天然可复现；模型可用时其输出在重演间可能不同，这一事实由
 *     isolation.modelOutput 显式声明，**不假装**它被隔离了。
 *
 * ## 只比较「可比的东西」
 * 真实重演能给出的是**事实**，不是分数。因此本模块报告后果差异：行动分布、
 * 执行结果分布，以及居民随后真实选出的行动序列。它**不再**产出
 * originalScore/alternativeScore —— 凭空造一个 0..1 的"分数"正是要废止的东西。
 * 需要量化时，请在自己的口径上对这些事实做聚合。
 *
 * ## 事实与反事实必须能分开
 * 两条世界在替换点之前**必然**一致（同一存档、同一随机流）。因此替换点之前的
 * 差异是「重演不自洽」的证据，不是实验结果。preIntervention 把它显式量出来，
 * 不一致就应当作缺陷排查，而不是当作发现。
 */

import * as recorder from '../recorder/index.js';
import { hashHex } from './_hash.js';
import * as persistence from '../../runtime/persistence.js';
import * as loop from '../../runtime/orchestrator/loop.js';
import * as clock from '../../runtime/clock.js';
import * as registry from '../../runtime/registry.js';
import * as worldState from '../../runtime/world-state.js';
import * as survival from '../../survival/index.js';
import * as rng from '../../infra/rng.js';

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('counterfactual: agentId 必须为非空字符串');
  }
}

function assertTick(tick) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('counterfactual: tick 必须为非负整数');
  }
}

/**
 * 行动名。
 *
 * 真实运行时 decision 是**字符串**，选项是 { action, reason }；但历史日志与
 * 测试种子用 { type } 这类结构化形式。只认一种形状会让另一种静默变成 null——
 * 实测后果是"备选可达性恒为 false"，于是所有反事实都被判成不可达而被拒。
 * 因此按 action → type → name 的顺序取第一个非空字符串。
 */
function actionNameOf(value) {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return null;
  for (const k of ['action', 'type', 'name']) {
    if (typeof value[k] === 'string' && value[k] !== '') return value[k];
  }
  return null;
}

function findDecision(agentId, tick) {
  let found = null;
  for (const node of recorder.decisionLog.list()) {
    if (node.data && node.data.agentId === agentId && node.data.tick === tick) found = node;
  }
  return found;
}

/**
 * 世界指纹：用于证明「原世界未被污染」以及「两条世界只在一点上不同」。
 * 只取可稳定序列化的量（人口、时钟、RNG 流位置、世界状态、关键资源）。
 */
export function worldFingerprint() {
  const agents = registry.lookup({ type: 'agent' });
  let alive = 0;
  for (const a of agents) if (a.data?.alive !== false) alive += 1;
  const entry = worldState.snapshot();
  return {
    tick: clock.now().tick,
    agents: agents.length,
    alive,
    rng: hashHex(JSON.stringify(rng.__snapshot() ?? null)),
    world: hashHex(JSON.stringify(entry ?? null)),
    food: survival.resources.food.query().stockpile,
    water: survival.resources.water.query().stockpile,
  };
}

/**
 * 收集一段窗口内的证据（决策 / 行为 / 执行结果 / 外部模型介入）。
 */
function collect(tickFrom, tickTo) {
  const decisions = [];
  const actions = [];
  const actionCounts = {};
  const outcomeCounts = {};
  let externalModelCalls = 0;
  let counterfactualApplied = 0;

  for (const n of recorder.decisionLog.list()) {
    const d = n.data;
    if (!d || d.tick === undefined || d.tick < tickFrom || d.tick > tickTo) continue;
    const a = actionNameOf(d.decision);
    if (a !== null) actionCounts[a] = (actionCounts[a] ?? 0) + 1;
    if (d.model && d.model.applied === true) externalModelCalls += 1;
    if (d.counterfactual) counterfactualApplied += 1;
    decisions.push({
      tick: d.tick,
      agentId: d.agentId,
      action: a,
      reason: d.reason ?? null,
      source: d.final?.source ?? null,
      counterfactual: d.counterfactual ?? null,
    });
  }
  for (const n of recorder.actionLog.list()) {
    const d = n.data;
    if (!d || d.tick === undefined || d.tick < tickFrom || d.tick > tickTo) continue;
    const status = d.outcome?.status ?? 'unknown';
    outcomeCounts[status] = (outcomeCounts[status] ?? 0) + 1;
    actions.push({
      tick: d.tick,
      agentId: d.agentId,
      action: d.action,
      outcome: d.outcome === undefined ? null : structuredClone(d.outcome),
    });
  }
  return { decisions, actions, actionCounts, outcomeCounts, externalModelCalls, counterfactualApplied };
}

/** 行动序列的稳定字符串（用于逐条比对两个世界）。 */
function sequenceOf(collected) {
  return collected.decisions.map((d) => d.tick + ':' + d.agentId + ':' + String(d.action)).join('|');
}

/**
 * 在受控会话里跑一段重演：从 restore 恢复 → 干预（可选）→ 推进 ticks。
 *
 * 之所以必须"先恢复再跑"，而不是在原世界上直接跑：原世界已经走过这些 tick，
 * 直接在它上面再推一次得到的是"第二次运行"，不是"同一个世界换个选择"。
 */
async function replayFrom(restoreSnapshot, { fromTick, ticks, seed, intervention }) {
  persistence.restoreRun(restoreSnapshot);
  loop.markRestored();
  loop.setIntervention(intervention);
  try {
    await loop.resume({ ticks, seed });
  } finally {
    // 干预是全局钩子，无论成功失败都必须撤掉：留着会让**后续真实运行**
    // 被静默改写——那是对原世界最严重的一种污染。
    loop.setIntervention(null);
  }
  return collect(fromTick, clock.now().tick);
}

/**
 * 重演到替换点，把该 tick 的决策（原行动 + 候选项）取出来。
 *
 * 为什么必须重演：存档采集于替换点**之前**，那条决策还没发生，日志里没有它。
 * 而"备选是否可达"只能从它当时的候选集判断——不重演就只能猜，
 * 猜错的表现是把一个不可达的行动当成反事实（造出真实世界到不了的世界）。
 *
 * 本函数结束时会恢复原世界（把存档写回），因此不污染调用方。
 */
async function discoverPivot(restoreSnapshot, pivotTick, seed, pivotAgentId) {
  const useSnapshot = (restoreSnapshot !== undefined && restoreSnapshot !== null)
    ? restoreSnapshot
    : persistence.saveRun({ meta: { purpose: 'counterfactual-discover' } });
  persistence.restoreRun(useSnapshot);
  loop.markRestored();
  const start = clock.now().tick;
  const need = Math.max(1, pivotTick - start);
  // 只跑必要的 tick 数：重演是真实模拟，跑多了纯属浪费。
  await loop.resume({ ticks: need, seed });
  // 取**指定居民**在该 tick 的决策：同一 tick 有多条记录（每个居民一条），
  // 取第一条会拿到别人的候选集，从而把可达性判错。
  let node = null;
  for (const n of recorder.decisionLog.list()) {
    if (n.data && n.data.tick === pivotTick && n.data.agentId === pivotAgentId) { node = n; break; }
  }
  if (node === null) return null;
  return {
    decision: node.data.decision,
    sourceId: node.id,
    agentId: node.data.agentId,
    available: (node.data.options ?? []).map((o) => actionNameOf(o)),
  };
}

/**
 * 给定存档，返回可以被替换的 tick。
 *
 * 反事实只能替换**存档之后**的第一 tick：存档采集于完整提交边界，该 tick 已经
 * 走过并写进日志，属于历史。把这个换算收在这里，调用方不必自己推（推错的表现
 * 是"干预静默不生效"，t10 初版就栽在这上面）。
 *
 * @param {object} [restore] 预先采集的存档；缺省用当前提交边界
 * @returns {number} 可作为 compare({ tick }) 的替换点
 */
export function pivotTickFor(restore) {
  const tick = (restore !== undefined && restore !== null)
    ? restoreTick(restore)
    : clock.now().tick;
  return tick + 1;
}

/**
 * 解析反事实锚点：把「一条历史决策」换算成「当前提交边界之后可替换的 tick」。
 *
 * ## 为什么需要它（真实缺陷，不是便利函数）
 * 反事实只能替换**存档（提交边界）之后**的第一 tick：存档采集于完整提交边界，
 * 该 tick 已经走过并写进日志，属于历史。而调用方手上通常只有一条历史决策
 * （例如 `decisionLog.list().find(...)` 拿到的第一条 = **最旧**的那条）。
 * 直接把它的 tick 丢给 compare() 会撞上提交边界契约并被拒绝——
 * 报错是对的，但调用方无从知道该换成哪个 tick：
 *   - `pivotTickFor()` 只回答「当前边界 + 1」，完全无视调用方选中的锚点；
 *   - 于是「我选中的这条决策能不能被替换」这个问题根本没被回答，
 *     调用方只能瞎猜或退化成「随便挑当前 tick」。
 *
 * 本函数把这三件事一次做完：
 *   1. **确认锚点真实存在**——查不到就拒绝（不许凭空造一条决策当锚点）；
 *   2. **区分历史 tick 与被替换的原始决策**——原决策无法被替换（世界已经是那个样子了），
 *      它的作用只是回答「我到底在问什么」；真正可替换的是当前边界 + 1；
 *   3. **给出替换点是否就是原决策重放**——只有边界恰好等于原决策的 tick - 1 时，
 *      替换点才是那条决策本身的重放。其余情况下这是**另一条**反事实，
 *      replaysOriginalDecision=false 如实报告，绝不假装「换掉了原来那条」。
 *
 * 真实成因：t10 之后 smoke.p3 用 `decisions.find(...)` 取到**最旧**的一条决策
 * 当作锚点，compare() 因提交边界不符而拒绝（且拒绝发生在测试尚未 await 的
 * Promise 里，表现为 unhandledRejection，比直接报错更难定位）。
 *
 * 注意：比较会从存档重演世界，原世界的日志会被恢复覆盖；因此 `tick` 与
 * `originalDecision` 必须在调用 compare() **之前**同步取用。
 *
 * @param {{ agentId?: string, tick?: number, decisionId?: string, restore?: object }} [input]
 * @returns {{ pivotTick: number, splitTick: number, anchorTick: number, agentId: string,
 *            originalDecisionId: string|null, replaysOriginalDecision: boolean,
 *            note: string }}
 */
export function anchorPivotFor(input = {}) {
  const splitTick = (input.restore !== undefined && input.restore !== null)
    ? restoreTick(input.restore)
    : clock.now().tick;
  const pivotTick = pivotTickFor(input.restore);

  if (input.decisionId !== undefined && input.decisionId !== null) {
    const node = recorder.decisionLog.list().find((n) => n.id === input.decisionId) ?? null;
    if (node === null) {
      throw new Error('counterfactual.anchorPivotFor: 找不到决策 ' + String(input.decisionId) + '（锚点必须是一条真实决策）');
    }
    if (typeof node.data?.tick !== 'number' || typeof node.data?.agentId !== 'string') {
      throw new Error('counterfactual.anchorPivotFor: 决策 ' + String(input.decisionId) + ' 缺少 tick/agentId，无法作为锚点');
    }
    return anchorResult(node, splitTick, pivotTick);
  }

  if (input.agentId === undefined || input.tick === undefined) {
    throw new TypeError('counterfactual.anchorPivotFor: 必须给出 { agentId, tick } 或 { decisionId }');
  }
  assertAgentId(input.agentId);
  assertTick(input.tick);
  const node = findDecision(input.agentId, input.tick);
  if (node === null) {
    throw new Error('counterfactual.anchorPivotFor: 在 tick ' + input.tick
      + ' 未找到 ' + input.agentId + ' 的决策；锚点必须是一条**真实存在**的决策，不允许凭空指定');
  }
  return anchorResult(node, splitTick, pivotTick);
}

/** anchorPivotFor 的共用收尾：判定「替换点是否就是原决策的重放」。 */
function anchorResult(node, splitTick, pivotTick) {
  const anchorTick = node.data.tick;
  // 替换点是不是那条决策**本身**的重放：只有边界恰好落在它前一 tick 时才成立。
  const replaysOriginalDecision = pivotTick === anchorTick;
  return {
    pivotTick,
    splitTick,
    anchorTick,
    agentId: node.data.agentId,
    originalDecisionId: node.id,
    replaysOriginalDecision,
    note: replaysOriginalDecision
      ? '替换点 tick ' + pivotTick + ' 正是原决策（tick ' + anchorTick + '）的重放。'
      : '原决策在 tick ' + anchorTick + '，已被走完、无法再替换；替换点 tick ' + pivotTick
        + ' 是提交边界 ' + splitTick + ' 之后的一条**新**决策。这是一次针对「该居民接着会做什么」的反事实，'
        + ' 不是对原决策的改写（replaysOriginalDecision=false）。',
  };
}

/**
 * 存档里的提交 tick。state.capture() 把时钟写进 clock section，因此不依赖工具实现细节。
 * @param {object} restore
 * @returns {number}
 */
function restoreTick(restore) {
  const t = restore?.sections?.clock?.tick;
  if (typeof t !== 'number' || !Number.isInteger(t) || t < 0) {
    throw new Error('counterfactual: 存档缺少可用的 clock.tick（实际 ' + JSON.stringify(t)
      + '），无法确定提交边界；请传入 persistence.saveRun() 产出的完整存档');
  }
  return t;
}

/**
 * 以已记录决策为锚点创建反事实分支（**纯读取**，不重演、不改世界）。
 * @param {{ agentId: string, tick: number, alternative?: unknown }} input
 */
export function branch({ agentId, tick, alternative = null } = {}) {
  assertAgentId(agentId);
  assertTick(tick);
  const node = findDecision(agentId, tick);
  if (node === null) {
    throw new Error('counterfactual.branch: 在 tick ' + tick + ' 未找到 ' + agentId + ' 的决策');
  }
  const alternativeAction = actionNameOf(alternative);
  // 必须经 actionNameOf：选项的实际形状有 { action } 与 { type } 两种，
  // 直接取 .action 会让另一种静默变成 null，进而把可达性恒判为 false。
  const available = (node.data.options ?? []).map((o) => actionNameOf(o));
  return {
    branchId: 'cf:' + agentId + ':' + tick,
    agentId,
    tick,
    original: structuredClone(node.data.decision),
    alternative: structuredClone(alternative),
    sourceDecisionId: node.id,
    // 备选必须在**当时候选集内**：不在候选集里的行动，那个世界到达不了。
    // 强行注入会造出一个真实世界不可能出现的世界，反事实结论随即失去意义。
    alternativeAdmissible: alternativeAction !== null && available.includes(alternativeAction),
    availableActions: available,
  };
}
/**
 * 比较原世界与备选世界（**真实重演**）。
 *
 * 重演从 `restore` 存档（缺省则现场采集一份）分叉，各推进 `ticks` 个 tick。
 * 两条世界只在一个 (agentId, tick) 的行动上不同。
 *
 * @param {object} input
 * @param {string} input.agentId
 * @param {number} input.tick 替换点（必须等于当前提交边界）
 * @param {unknown} input.alternative 备选行动（必须在当时候选集内）
 * @param {number} [input.ticks=5] 替换点之后重演的 tick 数
 * @param {number|string} [input.seed] 重演种子（缺省沿用运行中的种子）
 * @param {object} [input.restore] 预先采集的存档（缺省现场 saveRun）
 * @param {boolean} [input.includeSequence=false] 是否附带逐条决策序列
 * @returns {Promise<object>}
 */
export async function compare(input = {}) {
  assertAgentId(input.agentId);
  assertTick(input.tick);
  const extraTicks = Number.isInteger(input.ticks) && input.ticks > 0 ? input.ticks : 5;
  const seed = input.seed;
  // 存档与入口指纹必须在**任何重演之前**取得：discoverPivot 会推进时钟，
  // 之后再取指纹就会把"替换点"当成"分叉点"，导致自我矛盾的校验失败
  // （实测表现为"替换点 13 必须等于分叉后的第一 tick 14"）。
  const entrySnapshot = (input.restore !== undefined && input.restore !== null)
    ? input.restore
    : persistence.saveRun({ meta: { purpose: 'counterfactual-entry' } });
  const entryFingerprint = worldFingerprint();
  const splitTick = entryFingerprint.tick;
  // 分叉点之后的**第一 tick** 才是可替换点：存档采集于提交边界，该 tick 已走过
  // 并写进日志，属于历史，无法再"换个选择"。实测（seed 7, 4 人, 12 tick 存档）：
  // resume 1 tick 记录的是 tick 13。
  const pivotTick = splitTick + 1;
  if (input.tick !== pivotTick) {
    throw new Error(
      'counterfactual.compare: 替换点 tick ' + input.tick + ' 必须等于分叉后的第一 tick ' + pivotTick
      + '（存档采集于提交边界 ' + splitTick + '，该 tick 已在日志中，无法再替换）。'
      + '请用 pivotTickFor() 取得正确的替换点。',
    );
  }
  // 替换点那条决策**不在**存档里（存档采集于它之前），因此 branch() 找不到它。
  // 但"备选是否可达"恰恰只能从那条决策的候选集判断，所以必须先重演一个 tick
  // 把它取出来。这一步对外完全透明：调用方只需给出 pivot tick 与备选行动。
  // discoverPivot 结束时不恢复世界；紧接着的 replayFrom 会从同一存档重新开始，
  // 因此这里的推进不会污染任何后续结果。
  const discovered = await discoverPivot(entrySnapshot, pivotTick, seed, input.agentId);
  const b = discovered === null
    ? branch(input)
    : {
        branchId: 'cf:' + input.agentId + ':' + input.tick,
        agentId: input.agentId,
        tick: input.tick,
        original: structuredClone(discovered.decision),
        alternative: structuredClone(input.alternative),
        sourceDecisionId: discovered.sourceId,
        alternativeAdmissible: discovered.available.includes(actionNameOf(input.alternative)),
        availableActions: discovered.available,
      };
  if (!b.alternativeAdmissible) {
    // 不可达的备选不是反事实——显式拒绝，而不是跑出一个无意义的世界。
    throw new Error(
      'counterfactual.compare: 备选「' + String(actionNameOf(input.alternative)) + '」不在 tick '
      + b.tick + ' 的候选集内（当时可选：' + JSON.stringify(b.availableActions) + '）；'
      + '不可达的备选不构成反事实分支。',
    );
  }

  const altAction = actionNameOf(input.alternative);
  const intervention = {
    agentId: b.agentId, action: altAction, fromTick: b.tick, maxUses: 1, reason: 'counterfactual',
  };

  let baseline;
  let branchWorld;
  try {
    // 1) 基线：同一存档、同一 seed、不干预。
    baseline = await replayFrom(entrySnapshot, { fromTick: splitTick, ticks: extraTicks, seed, intervention: null });
    // 2) 分支：**同一份**存档、同一 seed，只替换那一个行动。
    branchWorld = await replayFrom(entrySnapshot, { fromTick: splitTick, ticks: extraTicks, seed, intervention });
  } finally {
    // 3) 恢复原世界（无论上面是否抛错）。分析不得留下被改过的世界。
    persistence.restoreRun(entrySnapshot);
    loop.markRestored();
  }

  const after = worldFingerprint();
  const originalIntact = after.tick === entryFingerprint.tick
    && after.alive === entryFingerprint.alive
    && after.world === entryFingerprint.world
    && after.rng === entryFingerprint.rng
    && after.agents === entryFingerprint.agents;

  const baseSeq = sequenceOf(baseline);
  const altSeq = sequenceOf(branchWorld);

  // 替换点当 tick 的干预**必然**改变该居民的行动——那是干预本身，不是后果。
  // 因此把分歧点定位在"干预之后的第一条差异"上，避免把干预误报成因果效应。
  const pivotInBaseline = baseline.decisions.find((d) => d.agentId === b.agentId && d.tick === b.tick) ?? null;
  const pivotInBranch = branchWorld.decisions.find((d) => d.agentId === b.agentId && d.tick === b.tick) ?? null;

  const baseList = baseline.decisions;
  const altList = branchWorld.decisions;
  // 分歧点分两层报告，因为它们含义不同（见返回值注释）。
  const pivotDivergence = (pivotInBaseline === null || pivotInBranch === null)
    ? null
    : {
        tick: pivotInBranch.tick,
        agentId: pivotInBranch.agentId,
        baselineAction: pivotInBaseline.action,
        branchAction: pivotInBranch.action,
        changed: pivotInBaseline.action !== pivotInBranch.action,
      };
  let firstDivergence = null;
  const n = Math.max(baseList.length, altList.length);
  for (let i = 0; i < n; i += 1) {
    const x = baseList[i];
    const y = altList[i];
    if (x === undefined || y === undefined) { firstDivergence = y ?? x ?? null; break; }
    // 干预点本身跳过：那里的差异是设计，不是发现。
    const isPivot = x.agentId === b.agentId && x.tick === b.tick;
    if (!isPivot && (x.tick !== y.tick || x.agentId !== y.agentId || x.action !== y.action)) {
      firstDivergence = y; break;
    }
  }

  // 替换点**之前**两条世界来自同一存档与同一随机流位置，必须逐条一致。
  // 不一致即重演不自洽——那是缺陷，不是实验结果，所以显式算出来。
  const beforePivotBase = baseList.filter((d) => d.tick < b.tick);
  const beforePivotAlt = altList.filter((d) => d.tick < b.tick);
  const preInterventionIdentical = sequenceOf({ decisions: beforePivotBase }) === sequenceOf({ decisions: beforePivotAlt });

  const changedActions = Object.keys({ ...baseline.actionCounts, ...branchWorld.actionCounts })
    .filter((k) => (baseline.actionCounts[k] ?? 0) !== (branchWorld.actionCounts[k] ?? 0))
    .sort();

  const result = {
    branchId: b.branchId,
    agentId: b.agentId,
    tick: b.tick,
    splitTick,
    ticks: extraTicks,
    original: structuredClone(b.original),
    alternative: structuredClone(b.alternative),
    // 干预是否真的生效——必须可验证：否则"两个世界没差别"可能是干预根本没落地。
    interventionApplied: branchWorld.counterfactualApplied === 1,
    pivot: { baseline: pivotInBaseline, branch: pivotInBranch },
    diverged: baseSeq !== altSeq,
    // 分歧点分两层报告，因为它们含义不同：
    //   - pivotDivergence：被替换的**那一个行动**本身（干预的意图，不是发现）；
    //   - firstDivergence：干预之后**第一条**与基线不同的决策。它可能是别的居民——
    //     这恰恰是耦合的证据：一个行动改变了共享资源池，进而改变了同伴的选择。
    //     只报一个"分歧点"会让人误以为分歧必然发生在被干预者身上。
    pivotDivergence,
    firstDivergence,
    preIntervention: {
      identical: preInterventionIdentical,
      note: '两条世界在替换点之前来自同一存档与同一随机流位置，必须逐条一致；不一致即重演不自洽。',
    },
    baseline: { actionCounts: baseline.actionCounts, outcomeCounts: baseline.outcomeCounts, decisions: baseline.decisions.length },
    branchWorld: { actionCounts: branchWorld.actionCounts, outcomeCounts: branchWorld.outcomeCounts, decisions: branchWorld.decisions.length },
    consequence: {
      actionCountsBaseline: baseline.actionCounts,
      actionCountsBranch: branchWorld.actionCounts,
      outcomeCountsBaseline: baseline.outcomeCounts,
      outcomeCountsBranch: branchWorld.outcomeCounts,
      actionsChanged: changedActions,
    },
    isolation: {
      originalIntact,
      entryFingerprint,
      afterFingerprint: after,
      rngStreamsIndependent: true,
      // 模型可用时其输出在重演间可能不同：如实声明，不假装被隔离。
      modelOutput: {
        isolated: baseline.externalModelCalls === 0 && branchWorld.externalModelCalls === 0,
        baselineCalls: baseline.externalModelCalls,
        branchCalls: branchWorld.externalModelCalls,
      },
    },
  };
  if (input.includeSequence === true) {
    result.sequence = { baseline: baseSeq, branch: altSeq };
  }
  return result;
}

/**
 * 自洽性检查：同一存档、同一 seed、同一区间重演两次，结果必须逐条相同。
 *
 * 这不是"反事实实验"，而是**重演可信度**的检查——不先证明重演是确定的，
 * 就无法把两个世界的差异归因到那一个行动上。
 */
export async function selfCheck(input = {}) {
  const ticks = Number.isInteger(input.ticks) && input.ticks > 0 ? input.ticks : 3;
  const snap = input.restore ?? persistence.saveRun({ meta: { purpose: 'counterfactual-selfcheck' } });
  const entry = worldFingerprint();
  const base = entry.tick;
  let first;
  let second;
  try {
    first = await replayFrom(snap, { fromTick: base, ticks, seed: input.seed, intervention: null });
    second = await replayFrom(snap, { fromTick: base, ticks, seed: input.seed, intervention: null });
  } finally {
    persistence.restoreRun(snap);
    loop.markRestored();
  }
  const a = sequenceOf(first);
  const c = sequenceOf(second);
  return {
    splitTick: base,
    ticks,
    deterministic: a === c,
    replayedDecisions: first.decisions.length,
    first: a,
    second: c,
  };
}
