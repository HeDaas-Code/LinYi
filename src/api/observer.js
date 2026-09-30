/**
 * truman-town.api.observer — 观测接口 / Observer API
 *
 * 对外查询世界状态、智能体详情、**运行态真相**、阶段流与存档状态：
 *   GET  /api/v1/world/state           → 当前世界状态快照（tick / 资源 / 需求 / 编年计数）
 *   GET  /api/v1/agents/:agent_id      → 智能体详情 + 最近决策 / 行为日志
 *   GET  /api/v1/sim/status            → 运行态真相（phase / state / driver / 提交边界 / 节拍）
 *   GET  /api/v1/sim/stages            → 当前阶段 + 最近 tick 的阶段时间线
 *   GET  /api/v1/sim/stream            → SSE：status / progress / done
 *   GET  /api/v1/sim/decisions         → 最近决策（意图 → 最终行动 → 执行结果）
 *   GET  /api/v1/decisions/:decision_id → 单条决策的完整链路（跨 tick 歧义时要求带 tick）
 *   GET  /api/v1/sim/persistence       → 存档能力与最近一次保存 / 恢复
 *   POST /api/v1/sim/save              → 保存完整运行存档
 *   POST /api/v1/sim/restore           → 从存档恢复（提交边界对齐到存档 tick）
 *
 * 本模块锁定的核心契约只有一条：**API 不得用 running 标签伪装真实后台运行。**
 *   - phase  表达操作者意图（可以就是 'running'）；
 *   - state / stateReason / advancing / background / driver 表达**实际**是否有人在推进。
 * 只报 phase 而报不出后三者，正是旧实现"看起来在跑其实没跑"的成因。
 */

import * as registry from '../runtime/registry.js';
import * as loop from '../runtime/orchestrator/loop.js';
import * as stageProgress from '../runtime/orchestrator/stage-progress.js';
import * as metronome from '../runtime/orchestrator/metronome.js';
import * as persistence from '../runtime/persistence.js';
import * as snapshotFile from '../infra/store/snapshot-file.js';
import * as logger from '../infra/logger.js';
import { recorder } from '../observer/index.js';
import { HttpError, sendEventStream, writeSse } from './http.js';
import { currentPhase } from './control.js';
import path from 'node:path';

/**
 * state 取值 → 给人看的说明。键与 state 取值一一对应，
 * 使前端不必自己维护一份"这些状态码到底什么意思"的映射。
 */
export const STATE_DESCRIPTION = Object.freeze({
  idle: '尚未启动：没有任何 tick 被推进过',
  advancing: '此刻正有一个 tick 在推进（阶段明细见 stage / sim/stages）',
  ready: '已就绪但无人推进：需要显式 step，或 start({background:true}) 挂机',
  running: '有真实后台推进器在按现实时间推进 tick',
  paused: '操作者暂停：tick 不再前进，但世界与人口都还在',
  stopped: '操作者停止：当前 tick 已跑完并提交，后台推进器已注销',
  failed: '最近一个 tick 失败：见 lastFailure（世界停在最后一次成功提交的边界）',
});

/** SSE 默认推送间隔（毫秒）。 */
const DEFAULT_STREAM_INTERVAL_MS = 500;
/** SSE 间隔的允许区间。 */
const MIN_STREAM_INTERVAL_MS = 50;
const MAX_STREAM_INTERVAL_MS = 60000;
/** 单次决策查询的上限（避免一次拉爆内存）。 */
const MAX_DECISIONS = 200;

// ---- 观测侧存档簿记（进程内，不进存档）----
//
// "最近一次保存/恢复"是**观测事实**，不是世界状态：把它写进存档会导致
// 恢复后 lastSave 变成"存档里的那次存档"，自指且无意义。
let lastSave = null;
let lastRestore = null;
let lastSnapshot = null;
let snapshotPath = null;
let snapshotFilePresent = false;
let snapshotStorageError = null;
let snapshotWriteQueue = Promise.resolve();

/** 从 query 取整型参数；缺省用 fallback，非法或越界抛 400。 */
function intParam(query, name, fallback, min, max) {
  if (query === null || query === undefined || typeof query.get !== 'function') return fallback;
  const raw = query.get(name);
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new HttpError(400, name + ' 必须为整数（收到 ' + raw + '）');
  }
  if (n < min || n > max) {
    throw new HttpError(400, name + ' 必须在 ' + min + '..' + max + ' 之间（收到 ' + n + '）');
  }
  return n;
}

/** 从 query 取可空整型（未提供时返回 null）。 */
function nullableIntParam(query, name, min, max) {
  if (query === null || query === undefined || typeof query.get !== 'function') return null;
  const raw = query.get(name);
  if (raw === null || raw === undefined || raw === '') return null;
  return intParam(query, name, null, min, max);
}

/** 当前世界状态快照（委托 loop.snapshot）。 */
export function worldState() {
  return loop.snapshot();
}

/**
 * 智能体详情：注册表实体 + 世界状态（存活/出生 tick/最近行为/需求）
 * + 最近决策与行为日志（各取最近 10 条）。
 * @param {string} agentId
 * @returns {object}
 */
export function agentDetail(agentId) {
  const record = registry.lookup(agentId);
  if (record === null || record.type !== 'agent') {
    throw new HttpError(404, 'agent not found: ' + agentId);
  }
  const snap = loop.snapshot();
  const worldAgent = snap.world.agents?.[agentId] ?? {};
  const needs = snap.world.needs?.[agentId] ?? {};
  const decisions = recorder.decisionLog.list()
    .filter((d) => d.data?.agentId === agentId)
    .slice(-10)
    .map((d) => d.data);
  const actions = recorder.actionLog.list()
    .filter((a) => a.data?.agentId === agentId)
    .slice(-10)
    .map((a) => a.data);
  return {
    id: agentId,
    name: record.data?.name,
    persona: record.data?.persona,
    alive: worldAgent.alive,
    bornTick: worldAgent.bornTick,
    lastAction: worldAgent.last_action ?? null,
    needs,
    recentDecisions: decisions,
    recentActions: actions,
  };
}

/** 行为日志按 decisionId 建索引，用于把「意图 → 执行 → 结果」串起来。 */
function executionIndex() {
  const byId = new Map();
  for (const node of recorder.actionLog.list()) {
    const d = node?.data;
    if (d && typeof d.decisionId === 'string') byId.set(d.decisionId, d);
  }
  return byId;
}

/** 给一条决策记录补上执行结果（按 decisionId 关联）。 */
function withExecution(decision, byId) {
  return {
    ...decision,
    execution: byId.get(decision.decisionId) ?? null,
  };
}

/**
 * 运行态真相。
 *
 * 这里刻意把「意图」与「事实」分开报：
 *   phase      —— 操作者意图（idle/running/paused/stopped）
 *   state      —— 综合事实（idle/ready/running/paused/stopped/failed）
 *   advancing  —— 此刻是否真的有 tick 在飞
 *   background —— 是否存在真实后台推进器
 *   driver     —— 谁在推进：metronome / manual-step / none
 */
export function simStatus() {
  const t = loop.tickStatus();
  const sp = stageProgress.summary();
  const met = metronome.status();
  const phase = currentPhase();

  const failed = stageProgress.lastFailure();
  // 「失败」是**最近一次失败比最近一次提交更新**，而不是一个永久标签：
  // 失败之后只要成功跑完一个 tick，现状就必须回到 ready。
  const failureLatest = failed !== null && failed.tick > t.committedTick;
  const background = sp.backgroundDriver === true;

  let state;
  let stateReason;
  if (t.inFlight === true) {
    // 正在推进是最"当下"的事实：此时报任何静态状态都会掩盖它。
    state = 'advancing';
    stateReason = 'tick_in_flight';
  } else if (failureLatest) {
    state = 'failed';
    stateReason = 'last_tick_failed';
  } else if (phase === 'stopped') {
    state = 'stopped';
    stateReason = 'operator_stopped';
  } else if (phase === 'paused') {
    state = 'paused';
    stateReason = 'operator_paused';
  } else if (background) {
    state = 'running';
    stateReason = 'background_driver';
  } else if (phase === 'running') {
    // 操作者说 running，但没有任何后台推进器——如实报 ready。
    state = 'ready';
    stateReason = 'no_background_driver';
  } else {
    state = 'idle';
    stateReason = 'not_started';
  }

  const driver = background
    ? 'metronome'
    : ((phase === 'running' || phase === 'paused') ? 'manual-step' : 'none');

  return {
    phase,
    state,
    stateReason,
    stateDescription: STATE_DESCRIPTION[state] ?? null,
    advancing: t.inFlight === true,
    background,
    driver,
    tick: t.tick,
    committedTick: t.committedTick,
    inFlight: t.inFlight,
    inFlightTick: t.inFlightTick,
    stageFailure: t.stageFailure,
    stage: sp.current === null ? null : sp.current.stage,
    agents: loop.snapshot().agents.length,
    lastCommit: sp.lastCommit,
    lastFailure: failed === null ? null : {
      kind: 'stage',
      tick: failed.tick,
      stage: failed.afterStage ?? null,
      afterStage: failed.afterStage ?? null,
      message: failed.error ?? null,
      at: failed.committedWallAt,
      ms: failed.totalMs,
      latest: failureLatest,
    },
    // t8：挂机节拍器的可见事实。
    stopping: met.stopping === true,
    pacing: {
      msPerTick: met.msPerTick,
      msPerTickSource: met.msPerTickSource,
      speed: met.speed,
      effectiveMsPerTick: met.effectiveMsPerTick,
      unpaced: met.unpaced,
    },
    metronome: {
      active: met.active,
      stopping: met.stopping,
      paused: met.paused,
      ticksRun: met.ticksRun,
      lastTickMs: met.lastTickMs,
      lastError: met.lastError,
    },
    autosave: met.autosave,
  };
}

/**
 * 阶段视图：当前正在跑的 tick 的阶段明细 + 最近若干已完成 tick 的时间线。
 * 已完成的 tick 会带 status（committed/failed），因此失败的 tick 事后仍可被观察，
 * 而不是随 currentTick 一起消失、只剩一个"committedTick 跳号了"的谜团。
 * @param {number} [limit=5]
 */
export function stages(limit = 5) {
  const t = loop.tickStatus();
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, stageProgress.MAX_RECENT_TICKS) : 5;
  return {
    tick: t.tick,
    committedTick: t.committedTick,
    inFlight: t.inFlight,
    current: stageProgress.current(),
    recent: stageProgress.recentTicks(n),
  };
}

/** 图表采样的资源维度（顺序即前端图例顺序）。 */
const SAMPLE_RESOURCES = Object.freeze(['food', 'water', 'energy', 'medical']);

/** 从 loop.snapshot() 的资源条目里取一个可画的数值。 */
function stockValue(entry) {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  const v = entry?.stockpile ?? entry?.stock ?? entry?.amount;
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

/**
 * 单个已提交 tick 的图表快照。
 *
 * 存在的理由：采样必须由「tick 完成」驱动，而不是由「前端刷新」驱动。
 * 前端轮询只更新状态与列表，采样只走这里——因此刷新多少次都不会多出一个点。
 *
 * 只读取**已提交边界**的当前状态。若两次采样之间跳过了 tick（快 tick 快于推送间隔），
 * 不伪造中间点（那会是把当前状态冒充成历史），而是用 missed 如实报出缺口。
 * @param {number} tick 已提交的 tick
 */
export function tickSample(tick) {
  const snap = loop.snapshot();
  const resources = {};
  for (const key of SAMPLE_RESOURCES) resources[key] = stockValue(snap.resources?.[key]);

  const agents = Array.isArray(snap.agents) ? snap.agents : Object.values(snap.agents ?? {});
  const needsMap = snap.world?.needs ?? {};
  const alive = agents.filter((a) => (a?.data?.alive ?? a?.alive) !== false);
  const foods = alive.map((a) => Number(needsMap[a?.id]?.food)).filter(Number.isFinite);
  const needs = foods.length === 0
    ? { min: 0, max: 0, avg: 0 }
    : {
      min: Math.min(...foods),
      max: Math.max(...foods),
      avg: foods.reduce((a, b) => a + b, 0) / foods.length,
    };

  const decisions = recentDecisions(MAX_DECISIONS, tick);
  const latencies = decisions.map((d) => d?.model?.latencyMs).filter((v) => Number.isFinite(v));
  const latency = latencies.length === 0
    ? { count: 0, avg: 0, max: 0 }
    : {
      count: latencies.length,
      avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      max: Math.max(...latencies),
    };

  return {
    tick,
    resources,
    needs,
    latency,
    alive: alive.length,
    population: agents.length,
    decisions: decisions.length,
    applied: decisions.filter((d) => d?.model?.applied === true).length,
  };
}

/**
 * SSE 阶段流：先推一帧 status，随后按间隔推 progress，最后推 done。
 * maxEvents 用于让客户端（与测试）能确定性地结束流；0 表示不限。
 * @param {{ req: object, res: object, query: URLSearchParams }} ctx
 */
export async function streamEvents(ctx) {
  const res = ctx?.res;
  const intervalMs = intParam(ctx?.query, 'intervalMs', DEFAULT_STREAM_INTERVAL_MS, MIN_STREAM_INTERVAL_MS, MAX_STREAM_INTERVAL_MS);
  const maxEvents = intParam(ctx?.query, 'maxEvents', 0, 0, 100000);

  sendEventStream(res, { retryMs: 3000 });
  let count = 0;
  const emit = (event, data) => {
    count += 1;
    writeSse(res, event, data);
    return count;
  };

  // 客户端断开必须让循环退出，否则每个断开的连接都会留下一个定时器。
  let closed = false;
  const onClose = () => { closed = true; };
  if (ctx?.req && typeof ctx.req.on === 'function') ctx.req.on('close', onClose);

  const finished = () => closed === true || res?.writableEnded === true;
  // maxEvents 预算里必须给 done 留一格，否则会多推一帧、越界。
  const budget = () => (maxEvents > 0 ? maxEvents - count : Infinity);

  // 采样由「已提交 tick 变化」驱动，而不是由客户端刷新驱动：
  // 同一个 tick 只推一帧 sample，因此前端刷新多少次都不会多出一个采样点。
  // 连接时若已有进度，先补一帧当前 tick，让图表立刻有基准而不是空白。
  let sampledTick = null;
  const sampleIfAdvanced = (committedTick) => {
    if (!Number.isInteger(committedTick) || committedTick <= 0) return;
    if (committedTick === sampledTick) return;
    if (budget() <= 1) return;
    // 快 tick 快于推送间隔时会跳号。此处不伪造中间点（那是把当前状态冒充成历史），
    // 而是如实报出缺口，让前端能说清"这段没有采样"。
    const missed = sampledTick === null ? 0 : Math.max(0, committedTick - sampledTick - 1);
    sampledTick = committedTick;
    emit('sample', { ...tickSample(committedTick), missed });
  };

  try {
    const first = simStatus();
    emit('status', first);
    sampleIfAdvanced(first.committedTick);
    while (finished() === false) {
      await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
      if (finished()) break;
      if (budget() <= 1) {
        emit('done', { events: maxEvents > 0 ? maxEvents : count });
        break;
      }
      const frame = simStatus();
      // sample 先于 progress：tick 刚提交时，采样帧不该被进度帧挤掉。
      sampleIfAdvanced(frame.committedTick);
      // progress 帧带上当前阶段明细：这正是「此刻跑到哪一步」的观测口径。
      if (budget() > 1) emit('progress', { ...frame, stageDetail: stageProgress.current() });
    }
  } finally {
    if (ctx?.req && typeof ctx.req.removeListener === 'function') ctx.req.removeListener('close', onClose);
    if (res && res.writableEnded !== true) res.end();
  }
}

/**
 * 最近决策：每条同时给出意图、最终行动与执行结果。
 * @param {number} [limit=10]
 * @param {number|null} [tick=null] 只看某一 tick（不传则取最近若干条）
 */
export function recentDecisions(limit = 10, tick = null) {
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_DECISIONS) : 10;
  const byId = executionIndex();
  const all = recorder.decisionLog.list().map((node) => node.data);
  const scoped = (tick === null || tick === undefined)
    ? all
    : all.filter((d) => d.tick === tick);
  return scoped.slice(-n).map((d) => withExecution(d, byId));
}

/**
 * 单条决策的完整链路。
 *
 * decisionId 由「居民 + 动作」构成，同一居民连续两 tick 选同一动作就会重名。
 * 此时**不猜**：明确报 ambiguous 并给出 hint，要求调用方带 tick 精确定位。
 * @param {string} decisionId
 * @param {number|null} [tick=null]
 */
export function decisionTrace(decisionId, tick = null) {
  if (typeof decisionId !== 'string' || decisionId.trim() === '') {
    throw new HttpError(400, 'decisionId 必须为非空字符串');
  }
  const byId = executionIndex();
  const all = recorder.decisionLog.list().map((node) => node.data)
    .filter((d) => d.decisionId === decisionId);
  if (all.length === 0) {
    throw new HttpError(404, 'decision not found: ' + decisionId);
  }
  const scoped = (tick === null || tick === undefined)
    ? all
    : all.filter((d) => d.tick === tick);
  if (scoped.length === 0) {
    throw new HttpError(404, 'decision not found at tick ' + tick + ': ' + decisionId);
  }
  if (scoped.length === 1) {
    return { ...withExecution(scoped[0], byId), occurrences: 1, ambiguous: false, hint: null };
  }
  const ticks = [...new Set(scoped.map((d) => d.tick))].sort((a, b) => a - b);
  return {
    ...withExecution(scoped[scoped.length - 1], byId),
    occurrences: scoped.length,
    ambiguous: true,
    hint: '同一 decisionId 在 ' + scoped.length + ' 条记录中出现（tick=' + ticks.join('/')
      + '）；请带 ?tick= 精确定位',
  };
}

/** 存档能力与最近一次保存 / 恢复状态。 */
export function persistenceStatus() {
  let sections = [];
  let available = true;
  let reason = null;
  try {
    sections = persistence.inventory();
  } catch (err) {
    // 观测端点不该因为存档子系统不可用而整个 500：如实报"不可用"更有用。
    available = false;
    reason = err instanceof Error ? err.message : String(err);
  }
  const coreCount = sections.filter((s) => s.kind === 'core').length;
  return {
    available,
    reason,
    coreCount,
    sections: sections.map((s) => ({
      name: s.name,
      kind: s.kind,
      description: s.description,
      hasSnapshot: s.hasSnapshot === true,
      hasRestore: s.hasRestore === true,
    })),
    lastSave,
    lastRestore,
    slot: lastSnapshot === null ? null : lastSave,
    storage: {
      configured: snapshotPath !== null,
      file: snapshotPath === null ? null : path.basename(snapshotPath),
      present: snapshotPath === null ? null : snapshotFilePresent,
      lastError: snapshotStorageError,
    },
  };
}

/** 初始化服务端单文件存档，并在存在有效存档时恢复运行。 */
export async function initializeSnapshotStorage(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('运行存档路径必须为非空字符串');
  }
  snapshotPath = path.resolve(filePath);
  snapshotFilePresent = false;
  snapshotStorageError = null;
  snapshotWriteQueue = Promise.resolve();

  let snapshot;
  try {
    snapshot = await snapshotFile.readSnapshot(snapshotPath);
  } catch (err) {
    snapshotStorageError = err instanceof Error ? err.message : String(err);
    throw err;
  }
  snapshotFilePresent = snapshot !== null;

  let restored = null;
  if (snapshot !== null) {
    const validation = persistence.validate(snapshot);
    if (validation.ok !== true) {
      snapshotStorageError = '运行存档不完整或版本不兼容：' + (validation.reason ?? '未知原因');
      throw new Error(snapshotStorageError);
    }
    restored = restoreRun({ snapshot });
    lastSnapshot = snapshot;
    const t = loop.tickStatus();
    lastSave = {
      tick: t.committedTick,
      at: snapshot.savedAt ?? null,
      records: Array.isArray(snapshot.records) ? snapshot.records.length : 0,
      sections: snapshot.sections && typeof snapshot.sections === 'object' ? Object.keys(snapshot.sections).length : 0,
      schemaVersion: snapshot.schemaVersion ?? null,
      reason: snapshot.meta?.reason ?? null,
    };
  }

  metronome.setAutosaveHook(({ reason }) => saveRunToDisk({ reason }));
  return {
    configured: true,
    file: path.basename(snapshotPath),
    restored: restored !== null,
    tick: restored?.restore?.committedTick ?? null,
  };
}

/**
 * 保存一次完整运行存档。
 * 推进中（inFlight）拒绝：半提交态存档在恢复后会自相矛盾
 * （时钟已前进、阶段却只跑了一半），因此宁可不存。
 */
function captureRun(input = {}) {
  const t = loop.tickStatus();
  if (t.inFlight === true) {
    throw new HttpError(409, 'tick 推进中不可存档（会存到一半旧一半新的世界）');
  }
  const opts = input ?? {};
  const meta = { ...(opts.meta ?? {}) };
  if (opts.reason !== undefined) meta.reason = opts.reason;
  return persistence.saveRun({ ...opts, meta });
}

function rememberSave(snapshot, input = {}) {
  const t = loop.tickStatus();
  const at = Date.now();
  lastSnapshot = snapshot;
  lastSave = {
    tick: t.committedTick,
    at,
    records: snapshot.counts.records,
    sections: snapshot.counts.sections,
    schemaVersion: snapshot.schemaVersion,
    reason: (input ?? {}).reason ?? null,
  };
  return { ok: true, save: lastSave, describe: persistence.describe(snapshot) };
}

/** 保存到当前进程内的快照槽，供现有调用方与测试使用。 */
export function saveRun(input = {}) {
  return rememberSave(captureRun(input), input);
}

/** 保存快照并等待写入配置的服务端存档文件。 */
export async function saveRunToDisk(input = {}) {
  const snapshot = captureRun(input);
  if (snapshotPath !== null) {
    const write = snapshotWriteQueue.then(() => snapshotFile.writeSnapshot(snapshotPath, snapshot));
    snapshotWriteQueue = write.catch(() => {});
    try {
      await write;
      snapshotFilePresent = true;
      snapshotStorageError = null;
    } catch (err) {
      snapshotStorageError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }
  return rememberSave(snapshot, input);
}

/**
 * 从存档恢复。恢复后提交边界对齐到存档的 tick，且旧进程的阶段记录全部清空
 * （跨进程泄漏会让观察者看到"上一个世界"的阶段）。
 * @param {{ snapshot?: object }} [input] 不传 snapshot 则用本进程最近一次保存的档。
 */
export function restoreRun(input = {}) {
  const t = loop.tickStatus();
  if (t.inFlight === true) {
    throw new HttpError(409, 'tick 推进中不可恢复（会撕掉正在跑的世界）');
  }
  const snapshot = (input ?? {}).snapshot ?? lastSnapshot;
  if (snapshot === null || snapshot === undefined) {
    throw new HttpError(409, '没有可用存档：请先 POST /api/v1/sim/save');
  }
  const v = persistence.validate(snapshot);
  if (v.ok !== true) {
    throw new HttpError(400, '存档不完整，拒绝恢复：' + (v.reason ?? '未知原因')
      + (v.missing.length > 0 ? '（缺少 ' + v.missing.join(', ') + '）' : ''));
  }
  const res = persistence.restoreRun(snapshot);
  // markRestored 是"恢复"与"继续跑"的分界：把提交边界对齐到恢复后的时钟，
  // 并清空阶段缓冲，否则旧 tick 的阶段会挂在新的时钟号上。
  const status = loop.markRestored();
  lastRestore = {
    tick: status.committedTick,
    at: Date.now(),
    records: Array.isArray(snapshot.records) ? snapshot.records.length : 0,
    schemaVersion: snapshot.schemaVersion ?? null,
    migratedFrom: res.migratedFrom ?? null,
  };
  return {
    ok: true,
    restore: {
      committedTick: status.committedTick,
      tick: status.tick,
      loaded: res.loaded ?? null,
      migratedFrom: res.migratedFrom ?? null,
      validation: res.validation ?? v,
    },
  };
}

/** 复位观测侧簿记（测试用）。 */
export function __reset() {
  lastSave = null;
  lastRestore = null;
  lastSnapshot = null;
  snapshotPath = null;
  snapshotFilePresent = false;
  snapshotStorageError = null;
  snapshotWriteQueue = Promise.resolve();
}

/** 本模块 HTTP 路由表。 */
export const routes = [
  { method: 'GET', path: '/api/v1/world/state', handler: () => worldState() },
  { method: 'GET', path: '/api/v1/agents/:agent_id', handler: ({ params }) => agentDetail(params.agent_id) },
  { method: 'GET', path: '/api/v1/sim/status', handler: () => simStatus() },
  { method: 'GET', path: '/api/v1/sim/stages', handler: ({ query }) => stages(intParam(query, 'limit', 5, 1, stageProgress.MAX_RECENT_TICKS)) },
  {
    method: 'GET',
    path: '/api/v1/sim/logs',
    handler: ({ query }) => ({
      stats: logger.stats(),
      entries: logger.recent(intParam(query, 'limit', 100, 1, 500), {
        topic: typeof query?.topic === 'string' ? query.topic : undefined,
        level: typeof query?.level === 'string' ? query.level : undefined,
      }),
    }),
  },
  { method: 'GET', path: '/api/v1/sim/stream', stream: true, handler: (ctx) => streamEvents(ctx) },
  {
    method: 'GET',
    path: '/api/v1/sim/decisions',
    handler: ({ query }) => recentDecisions(intParam(query, 'limit', 10, 1, MAX_DECISIONS), nullableIntParam(query, 'tick', 0, Number.MAX_SAFE_INTEGER)),
  },
  {
    method: 'GET',
    path: '/api/v1/decisions/:decision_id',
    handler: ({ params, query }) => decisionTrace(params.decision_id, nullableIntParam(query, 'tick', 0, Number.MAX_SAFE_INTEGER)),
  },
  { method: 'GET', path: '/api/v1/sim/persistence', handler: () => persistenceStatus() },
  { method: 'POST', path: '/api/v1/sim/save', handler: ({ body }) => saveRunToDisk(body ?? {}) },
  { method: 'POST', path: '/api/v1/sim/restore', handler: ({ body }) => restoreRun(body ?? {}) },
];
