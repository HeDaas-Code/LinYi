/**
 * truman-town.runtime.orchestrator.stage-progress — 阶段进度 / Stage Progress
 *
 * 把 `loop.tickSequence` 的每一次 yield 记成一个**阶段边界**，对外提供「当前 tick
 * 跑到哪一步、上一个 tick 何时提交、哪一个阶段失败」的可观测事实。
 *
 * 为什么需要它（t16）：
 *   一个 tick 在 50 人规模下约 225ms，其中 phase2:industry 单阶段就占一半。若观察者
 *   只能看到 tick 号，那么在两次 tick 之间它什么也看不到——「推进中」与「卡死」
 *   无法区分。阶段进度把这个黑箱摊开：viewer 轮询 /api/v1/sim/stages 或订阅
 *   /api/v1/sim/stream 即可看到「此刻正在跑 phase2:industry（第 3/11 步）」。
 *
 * 设计取舍：
 * - **只记事实，不做推断**：本模块不判断快慢、不给结论，只记录「哪个单元在何时被产出」。
 *   任何解释（性能归因、预算判定）都属于 t7 的 stage-timing 与观察者报告。
 * - **有界内存**：逐居民单元（decide/dispatch）在 50 人时每 tick 上百个，故相邻同 id
 *   单元**聚合成一条**（count 计数）；已完成 tick 只保留最近 MAX_RECENT_TICKS 个。
 *   长跑下本模块的内存占用与 tick 数无关。
 * - **后台推进器默认不存在**：`hasBackgroundDriver()` 默认为 false——这是**当前架构的
 *   事实**（只有显式 step 会推进 tick，没有任何 timer/interval）。挂机节拍器（t8）
 *   接入后应调用 `setBackgroundDriver(true)`。默认值刻意取「没有后台」这一侧：
 *   万一 t8 忘记登记，API 会**少报**成手动步进，而不是把手动步进**谎报**成后台运行。
 *   （少报是安全的保守方向；谎报后台运行正是 t16 要禁止的缺陷。）
 */

/** 已完成 tick 的保留上限（有界内存；长跑下与 tick 总数无关）。 */
export const MAX_RECENT_TICKS = 32;

/** 单个 tick 内阶段条目上限（超出后只累加 overflow，不再新增条目）。 */
export const MAX_STAGES_PER_TICK = 64;

/** 单调时钟（毫秒）。优先 performance.now()，缺失时回退 Date.now()。 */
function nowMs() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

/** 进行中的 tick；null 表示当前没有 tick 在跑。 */
let currentTick = null;
/** 已完成 tick 的环形缓冲（最近 MAX_RECENT_TICKS 个）。 */
let recent = [];
/** 是否已接入真实后台推进器（节拍器）。默认 false —— 见模块头注释。 */
let backgroundDriver = false;

/**
 * ---- 恢复边界（t25）----
 *
 * 本模块的三个状态**不同类**，恢复时不能一刀切，否则必错：
 *
 *   recent            —— 本进程的**历史观测**  → 刻意不入档，恢复后必须为空
 *   currentTick       —— 半截 tick（半提交态） → 刻意不入档，恢复后必须为 null
 *   backgroundDriver  —— **当下运行事实**      → 入档并恢复
 *
 * **为什么 recent / currentTick 刻意不入档**（本模块最重要的取舍）：
 *   1. 它们是**观测历史**，不是可推导的世界状态。存档只在完整 tick 之后采集，
 *      而阶段记录描述的是"上一个进程是怎么跑完那些 tick 的"——那种时长归因
 *      对恢复后的世界没有意义，也不属于"当前世界是什么"。
 *   2. 更重要：t16 已用测试锁定「恢复后 stages().recent.length === 0」
 *      （旧进程的阶段记录不得跨恢复泄漏）。若把 recent 入档，恢复后就会看到
 *      另一个进程的阶段时间线，该契约立刻破裂。观测历史在"世界等价"判定里是杂质，
 *      把它持久化等于把杂质变成契约。
 *   3. currentTick 是**半提交态**：能存档就意味着当时 inFlight === false
 *      （observer 的存档门要求这一点），因此它必然是 null。入档它只会在
 *      "存档门失效"时存下一个自相矛盾的世界。
 *
 * **为什么 backgroundDriver 必须入档**（与上面相反的取舍）：
 *   它回答「此刻有没有后台推进器在推进这个世界」，是**当下事实**。恢复后若一律清成
 *   false，而节拍器其实还在跑，观测 API 就会**谎报** driver='manual-step'——
 *   这正是 t16 明文要禁止的缺陷（用标签伪装真相）。
 *   注意它是**派生自 metronome 的真实值**（启动置 true、停止/复位置 false），
 *   不是可以随手写的标志位。
 */

/** 深拷贝并冻结，避免调用方改写内部状态。 */
function freeze(value) {
  return Object.freeze(structuredClone(value));
}

/**
 * 开始一个 tick 的阶段记录。
 * @param {number} tick 逻辑 tick 号
 */
export function begin(tick) {
  currentTick = {
    tick,
    startedAt: nowMs(),
    startedWallAt: Date.now(),
    stages: [],
    units: 0,
    overflow: 0,
    lastUnitAt: nowMs(),
  };
}

/**
 * 记录一个阶段单元被产出。
 * 相邻同 id 单元聚合为一条（count 计数），使逐居民单元不撑爆内存。
 * @param {string} id 阶段 id（如 'decide' / 'phase2:industry'）
 * @param {object|null} [detail] 该单元携带的进度明细
 */
export function unit(id, detail) {
  if (currentTick === null) return;
  const at = nowMs() - currentTick.startedAt;
  currentTick.units += 1;
  currentTick.lastUnitAt = nowMs();
  const last = currentTick.stages.length > 0 ? currentTick.stages[currentTick.stages.length - 1] : null;
  if (last !== null && last.id === id) {
    last.count += 1;
    last.lastAtMs = at;
    if (detail !== undefined && detail !== null) last.detail = detail;
    return;
  }
  if (currentTick.stages.length >= MAX_STAGES_PER_TICK) {
    currentTick.overflow += 1;
    return;
  }
  currentTick.stages.push({ id, count: 1, firstAtMs: at, lastAtMs: at, detail: detail ?? null });
}

/** 把一条记录推入环形缓冲。 */
function pushRecent(record) {
  recent.push(record);
  if (recent.length > MAX_RECENT_TICKS) recent = recent.slice(recent.length - MAX_RECENT_TICKS);
}

/**
 * 标记当前 tick 已完整提交（全部阶段跑完、末端快照写完）。
 * @param {number} tick
 * @param {{ status?: string }} [extra]
 */
export function commit(tick, extra = {}) {
  if (currentTick === null) return null;
  const totalMs = nowMs() - currentTick.startedAt;
  const record = {
    tick,
    status: extra.status ?? 'committed',
    startedWallAt: currentTick.startedWallAt,
    committedWallAt: Date.now(),
    totalMs,
    unitCount: currentTick.units,
    overflow: currentTick.overflow,
    stages: currentTick.stages,
  };
  pushRecent(record);
  currentTick = null;
  return record;
}

/**
 * 标记当前 tick 失败（阶段抛错）。失败记录同样进入环形缓冲，
 * 使「失败」在事后仍可被观察到，而不是随 currentTick 一起消失。
 * @param {number} tick
 * @param {Error|string} error
 */
export function fail(tick, error) {
  const message = error instanceof Error ? error.message : String(error);
  const stages = currentTick === null ? [] : currentTick.stages;
  const record = {
    tick,
    status: 'failed',
    startedWallAt: currentTick === null ? null : currentTick.startedWallAt,
    committedWallAt: Date.now(),
    totalMs: currentTick === null ? null : nowMs() - currentTick.startedAt,
    unitCount: currentTick === null ? 0 : currentTick.units,
    overflow: currentTick === null ? 0 : currentTick.overflow,
    stages,
    // 失败发生在哪一个阶段之后：单元是**跑完才 yield**的，所以最后一条已完成单元
    // 的下一段才是出错的那一段。记下来，观察者才能说「在 regen 之后出错」，
    // 而不是只丢一句异常文本让人自己猜。
    afterStage: stages.length === 0 ? null : stages[stages.length - 1].id,
    error: message,
  };
  pushRecent(record);
  currentTick = null;
  return record;
}

/**
 * 当前正在跑的 tick 的阶段快照。
 * @returns {{ tick: number, elapsedMs: number, units: number, overflow: number, stage: object|null, stages: object[] }|null}
 */
export function current() {
  if (currentTick === null) return null;
  const stages = currentTick.stages;
  return freeze({
    tick: currentTick.tick,
    elapsedMs: nowMs() - currentTick.startedAt,
    units: currentTick.units,
    overflow: currentTick.overflow,
    // stage = 最近被产出的那一个单元，即「此刻正在跑/刚跑完」的阶段。
    stage: stages.length === 0 ? null : stages[stages.length - 1],
    stages,
  });
}

/** 最近完成的 tick 记录（最新在后）。 */
export function recentTicks(limit = 5) {
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_RECENT_TICKS) : 5;
  return freeze(recent.slice(Math.max(0, recent.length - n)));
}

/** 最近一次已提交的 tick 记录。 */
export function lastCommitted() {
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i].status === 'committed') return freeze(recent[i]);
  }
  return null;
}

/** 最近一次失败的 tick 记录（无论其后是否又成功过）。 */
export function lastFailure() {
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i].status === 'failed') return freeze(recent[i]);
  }
  return null;
}

/**
 * 对外汇总：当前阶段 + 最近提交 + 最近失败 + 后台推进器事实。
 * 这是 API 层的唯一数据源，避免各端点各自拼装导致口径不一致。
 */
export function summary() {
  const cur = current();
  const last = lastCommitted();
  const failed = lastFailure();
  return freeze({
    inTick: cur !== null,
    current: cur,
    lastCommit: last === null ? null : {
      tick: last.tick,
      at: last.committedWallAt,
      ms: last.totalMs,
      units: last.unitCount,
    },
    lastFailure: failed === null ? null : {
      tick: failed.tick,
      at: failed.committedWallAt,
      ms: failed.totalMs,
      afterStage: failed.afterStage ?? null,
      error: failed.error ?? null,
    },
    backgroundDriver,
  });
}

/** 登记/撤销后台推进器（挂机节拍器 t8 接入时调用）。 */
export function setBackgroundDriver(on) {
  backgroundDriver = on === true;
  return backgroundDriver;
}

/**
 * 采集阶段进度的**可恢复子集**。
 *
 * 只带 backgroundDriver —— recent / currentTick **刻意不带**（理由见本模块头部的恢复边界说明）。
 * 因此返回值**故意**长得不像"全量快照"：它更像一句
 * 「恢复之后，后台推进器这件事应当是什么」。
 * @returns {{backgroundDriver: boolean, dropped: {recent: number, currentTick: boolean}}}
 */
export function __snapshot() {
  return {
    backgroundDriver,
    // 如实报告被丢弃了什么：读代码的人能一眼看出这是**有意丢弃**，而不是"忘了存"。
    // 注意它是**描述性元数据**（描述采集当时的状态），不是被恢复的状态值本身：
    // __restore 后它按当前实况重算，而不是被写回。
    dropped: droppedInfo(),
  };
}

/** 当前被刻意排除在存档之外的观测事实（描述性，供审计与自解释）。 */
function droppedInfo() {
  return {
    recent: recent.length,
    currentTick: currentTick !== null,
  };
}

/**
 * 快照字段的**恢复语义分类**（本模块对外的显式契约）。
 *
 * 为什么需要把它写死成一个导出常量：本模块是全局**唯一**故意不满足
 * 「恢复后逐字段一致」的 section。凡是拿 __snapshot() 做比较的地方
 * （存档往返比对、跨进程等价摘要、审计工具）都必须知道该排除谁，
 * 否则就会把「观测元数据按实况重算」误报成「恢复分叉」。
 *
 * 实测代价（本任务 t27 的直接动因）：跨进程等价摘要若把 dropped 一并严格比对，
 * 4/6/10/20 人口下**每一个 tick** 都会被判为分叉（连续进程 recent=N+K，
 * 恢复进程 recent=K），看上去像严重的恢复缺陷，实际是分类错误。
 *
 *   'state'       —— 可恢复的行为状态：跨进程必须逐位一致，不一致就是真缺陷。
 *   'observation' —— 本进程的观测元数据：**刻意不恢复**，跨进程预期不同。
 *                    对它的正确断言是「恢复后按实况重算」，不是「与存档前相等」。
 */
export const SNAPSHOT_FIELD_KINDS = Object.freeze({
  backgroundDriver: 'state',
  dropped: 'observation',
});

/**
 * 只取快照里的**可恢复行为状态**（跨进程必须逐位一致的那部分）。
 *
 * 供存档比对 / 等价摘要使用：拿它做严格 deepEqual，拿 observationalMeta()
 * 做「按实况重算」的断言。两者分开，才不会把观测差异当成行为分叉。
 * @param {object} [snap]
 * @returns {{backgroundDriver: boolean}}
 */
export function restorableState(snap) {
  const s = (snap !== undefined && snap !== null && typeof snap === 'object') ? snap : __snapshot();
  return { backgroundDriver: s.backgroundDriver === true };
}

/**
 * 只取快照里的**观测元数据**（刻意不恢复的那部分）。
 *
 * 注意语义：它描述的是**采集当时**这个进程手里有什么，不是要恢复的状态。
 * 恢复之后它会按新进程的实况重算（recent 必为 0）。
 * @param {object} [snap]
 * @returns {{recent: number, currentTick: boolean}}
 */
export function observationalMeta(snap) {
  const s = (snap !== undefined && snap !== null && typeof snap === 'object') ? snap : __snapshot();
  const d = (s.dropped !== null && typeof s.dropped === 'object') ? s.dropped : {};
  return {
    recent: Number.isInteger(d.recent) && d.recent >= 0 ? d.recent : 0,
    currentTick: d.currentTick === true,
  };
}

/**
 * 恢复阶段进度的可恢复子集。
 *
 * 语义（三条都要成立，测试逐条锁定）：
 *   1. recent 一律清空 —— 无论入档数据带没带它（旧档可能带、新档不带，
 *      两种都要收敛到同一结果）。观测历史绝不跨恢复泄漏。
 *   2. currentTick 一律清空 —— 恢复点是提交边界，不存在"进行中的 tick"。
 *   3. backgroundDriver 按入档值恢复，但**入档数据残缺时取 false**
 *      （保守方向：少报成手动步进，而不是把手动步进谎报成后台运行）。
 *
 * 幂等：恢复后再恢复一次结果相同。
 * @param {object|null} snap
 */
export function __restore(snap) {
  const s = (snap !== null && typeof snap === 'object') ? snap : {};
  currentTick = null;
  recent = [];
  // 显式要求严格 true：'true' / 1 / 缺字段都不算"有后台推进器"。
  backgroundDriver = s.backgroundDriver === true;
  // 不读 s.dropped：它是采集当时的**描述**，不是要恢复的状态。
  return __snapshot();
}

/** 当前是否存在真实后台推进器。默认 false（当前架构只有显式 step）。 */
export function hasBackgroundDriver() {
  return backgroundDriver;
}

/**
 * 复位阶段进度（**全量**复位，含 backgroundDriver）。
 *
 * 用于 loop.reset()（新一局）与 metronome.__reset()（强制停表）：这两处都要求
 * "连后台驱动标记一起归零"——新一局开始前不该继承上一局的驱动器事实。
 *
 * 与 __restore 的分工（容易混，务必分清）：
 *   - __reset()   = 全部归零，**包括** backgroundDriver。用于"世界重来"。
 *   - __restore() = 保留入档的 backgroundDriver，只清观测历史。用于"世界续跑"。
 * 存档恢复**不应**调 __reset()，否则会把恢复后仍在运行的后台推进器一并忘掉
 * （观测 API 随即谎报 driver='manual-step'）。见 loop.markRestored 的分支说明。
 */
export function __reset() {
  currentTick = null;
  recent = [];
  backgroundDriver = false;
}
