/**
 * truman-town.agent.decision.goals — 短期目标与多步计划 / Short-term Goals & Plans
 *
 * 结果学习（t4）与动作契约（t11）之后，居民已经能「知道某个动作值不值」，
 * 但还不能「为了一件跨 tick 才做成的事，连续几个 tick 做不同的事」。
 * 本模块补上这一层：**最小目标 + 前置条件 + 动作序列 + 时间预算 + 中断恢复**。
 *
 * ## 最小目标
 *
 * 目标不是宏大叙事，而是一个**可判定的期望状态**加一条**动作序列**：
 *   目标 = { 何时可以开始(available) + 有序步骤(step.action) + 每步的完成判据(step.doneWhen) }
 * 完成判据只看**世界真实状态**（背包里的原料/成品数），不看「我发出过命令」。
 * 这是本模块与「脚本化流水线」的根本区别：脚本假设命令成功，目标只承认结果。
 *
 * ## 依赖实际后果重规划（核心）
 *
 * 每个 tick 结束后，引擎拿**实测结果**（applied/started/planned/noop/failed）
 * 与**实测后的世界状态**做两件事：
 *
 *   1. **推进**：当前步骤的 doneWhen 在真实状态下成立 → 进入下一步。
 *      若某步的 doneWhen 在开始时就已成立，则**直接跳过**（不浪费 tick 重做）。
 *   2. **回退重规划**：当前步骤的动作**前置条件不满足**时，从**最早的未完成步骤**
 *      开始找第一个可执行的步骤并退回去做。
 *
 * 第 2 条是「采料 → 制作 → 出售」能真正跑通的关键：
 * 制作消耗原料，做完一件后原料见底，craft 立刻变得不可行（前置条件未满足）。
 * 此时引擎不是硬发一个必然被拒的 craft，而是**退回采料**——
 * 于是同一条三步序列在真实后果驱动下自然震荡成
 * 采料→制作→采料→制作→…→出售，而不需要把每一次采料都写死在序列里。
 *
 * ## 中断恢复
 *
 * 生存危机（食物/水达到危机阈值）**挂起**目标而不是丢弃：危机期间不参与打分，
 * 居民先活下来；危机解除后从**原来那一步**继续，已完成的部分不重做。
 * 挂起次数与累计挂起 tick 都记账，使「计划被生存打断」可观测。
 *
 * ## 定位：目标是**建议与倾向**，不是命令
 *
 * 目标只通过**有界加分**（goalWeight，默认 0.35，远小于生存门的 5 与人格项）
 * 影响选择，从不覆盖居民的决定；生存门永远优先。
 * 这与日程的定位一致：日程与目标都只提供建议，最终选择权在居民。
 * 与日程的区别在于**归属**：日程是外部时刻表，目标是居民自己的意图，
 * 因此目标按 agentId 持久保存，跨 tick、跨中断存活。
 *
 * 纯内存状态（与 contention / outcome-model 一致），不读图存储：
 * 逐 tick 逐居民调用，落图会让主循环退化为 O(n) 次全量读。
 */

/** 步骤完成判据使用的真实状态字段（缺失一律按 0 处理，而不是 NaN）。 */
function num(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : 0;
}

/**
 * 目标模板表。
 *
 * available 是**目标级前置条件**：不满足时该目标根本不会被选中（居民不会去追一个
 * 注定做不成的目标）。步骤级前置条件不在这里写死，而是运行时向
 * decision.action-contract 查询——动作的前置条件只有一个事实来源。
 */
const TEMPLATES = Object.freeze({
  // 旗舰目标：采料 → 制作 → 出售（跨 tick，且必须回退重规划才能跑通）。
  craft_and_sell: Object.freeze({
    id: 'craft_and_sell',
    goal: '采料 → 制作 → 出售',
    priority: 2,
    timeBudget: 60,
    maxAttempts: 8,
    // 有账户（卖得出去）且不是生存危机状态（有余力才谈得上经营）。
    available: (s) => s.hasAccount === true && s.hasItemCatalog === true
      && num(s.needs?.food) < 0.6 && num(s.needs?.water) < 0.6,
    steps: Object.freeze([
      Object.freeze({ action: 'forage', why: '采料：备齐 2 份制作原料', doneWhen: (s) => num(s.wood) >= 2 }),
      // 完成判据取**真实出售门槛**（背包可售产出品 > 2），而不是拍一个数字：
      // 门槛比真实门槛松会让居民做出一堆卖不掉的成品，比真实门槛紧则永远卖不出。
      Object.freeze({ action: 'craft', why: '制作：把原料做成成品，攒到可出售数量', doneWhen: (s) => num(s.surplus) >= 3 }),
      Object.freeze({ action: 'trade', why: '出售：把成品一次卖出换钱', doneWhen: (s) => num(s.surplus) < 3 }),
    ]),
  }),
  // 机会目标：手里已经有可售余货，直接卖掉（不必重走整条链）。
  sell_surplus: Object.freeze({
    id: 'sell_surplus',
    goal: '把现成的余货卖掉',
    priority: 3,
    timeBudget: 12,
    maxAttempts: 4,
    available: (s) => s.hasAccount === true && num(s.surplus) >= 3,
    steps: Object.freeze([
      Object.freeze({ action: 'trade', why: '出售：把背包里的成品卖掉', doneWhen: (s) => num(s.surplus) < 3 }),
    ]),
  }),
  // 兜底目标：还没有账户（无法交易）时，先把原料备好。
  gather_material: Object.freeze({
    id: 'gather_material',
    goal: '备齐制作原料',
    priority: 1,
    timeBudget: 20,
    maxAttempts: 6,
    available: (s) => num(s.wood) < 2 && num(s.needs?.food) < 0.6 && num(s.needs?.water) < 0.6,
    steps: Object.freeze([
      Object.freeze({ action: 'forage', why: '采料：备齐 2 份制作原料', doneWhen: (s) => num(s.wood) >= 2 }),
    ]),
  }),
});

/** 模板按优先级降序（同优先级按 id 字典序，保证确定性）。 */
const ORDERED = Object.freeze(
  Object.values(TEMPLATES).sort((a, b) => (b.priority - a.priority) || (a.id < b.id ? -1 : 1)),
);

/** @type {Map<string, object>} agentId → 计划 */
const plans = new Map();
/** @type {Map<string, {until:number, goalId:string}>} agentId → 放弃冷却（不立刻重选同一个做不成的目标） */
const cooldown = new Map();
/** 累计统计（供 summary 与跨种子对照）。前九项是事件级，后三项只计数。 */
const stats = {
  started: 0, achieved: 0, abandoned: 0, expired: 0,
  suspended: 0, resumed: 0, advanced: 0, replanned: 0, yielded: 0,
  // 例行转移：只计数不产事件（见 EVENTFUL 的说明）。
  diverged: 0, waiting: 0, blocked: 0, retried: 0,
};

/** 把例行转移计入统计（与 transition 的"只计数"约定配套）。 */
function count(type) {
  if (type === 'diverged') stats.diverged += 1;
  else if (type === 'waiting') stats.waiting += 1;
  else if (type === 'blocked') stats.blocked += 1;
  else if (type === 'retry') stats.retried += 1;
}

/**
 * **事件级**转移：低频、有意义、值得单独留档的生命周期变化。
 *
 * 其余高频的例行转移（diverged/waiting/blocked/retry）只累计计数，不写事件日志。
 * 理由：计划是**建议**，居民不按建议走是常态而不是异常——40 人 × 60 tick 实测
 * diverged 2225 次、waiting 717 次，若逐条写事件，光这两类就会淹没事件日志，
 * 把 1500 条的热区上限直接打满（并掩盖真正值得看的 started/achieved/abandoned）。
 * 每一条决策本来就在 decision-log 里带 goal.aligned 标记，逐次可查；
 * 事件日志只留"计划本身发生了什么"。
 */
const EVENTFUL = Object.freeze(new Set([
  'started', 'achieved', 'abandoned', 'suspended', 'resumed', 'expired', 'yielded', 'advanced', 'replanned',
]));

function transition(list, type, plan, extra = {}) {
  if (!EVENTFUL.has(type)) { count(type); return; } // 例行转移只计数，不产事件
  list.push({ type, goalId: plan?.goalId ?? null, stepIndex: plan?.stepIndex ?? null, ...extra });
}

/** 目标级前置条件是否满足，且第一个未完成步骤的动作**真的可执行**。 */
function startable(template, state) {
  try {
    if (template.available(state) !== true) return false;
  } catch { return false; }
  // 从第一个未完成步骤开始找（已完成的步骤不重做）。
  for (const step of template.steps) {
    let done = false;
    try { done = step.doneWhen(state) === true; } catch { done = false; }
    if (done) continue;
    // 目标级可用即视为可开始：第一个未完成步骤此刻可能因前置条件未满足而不可执行
    // （例如手里还没有原料），这正是**回退重规划**要处理的常态，不应据此拒绝目标。
    return true;
  }
  return false; // 所有步骤都已完成 = 目标已达成，无需开始
}

/**
 * 步骤的动作当前是否可执行。
 *
 * 两个判据缺一不可：
 *   1. 动作契约的前置条件（唯一事实来源）；
 *   2. **共享池的现实**——账本已经预支空的池，此刻再去做就是注定空转。
 *
 * 第 2 条是 t12 实测出来的：只有第 1 条时，目标会给 forage 加固定分，
 * 而争用惩罚是**情境**性的，固定分因此能盖过惩罚——采集空转率从 3.8% 反弹到 20.8%。
 * 计划不能只看「这个动作我能不能做」，还要看「现在做它有没有用」。
 *
 * @param {Set<string>|null} doomed 本 tick 注定落空的行动（共享池已被预支空）
 */
function stepAdmissible(step, state, contract, doomed) {
  if (doomed !== undefined && doomed !== null && doomed.has(step.action)) return false;
  try {
    return contract.preconditionOf(step.action, state).ok === true;
  } catch {
    // 契约不可用时**不假装可行**：视为不可行，由回退/放弃逻辑兜住。
    return false;
  }
}

/** 步骤的完成判据在真实状态下是否成立。 */
function stepDone(step, state) {
  try { return step.doneWhen(state) === true; } catch { return false; }
}

/**
 * 选择一个新目标。
 * @returns {object|null} 计划
 */
function select(agentId, tick, state) {
  const cd = cooldown.get(agentId);
  const cooling = (cd !== undefined && tick < cd.until) ? cd.goalId : null;
  for (const template of ORDERED) {
    // 刚放弃过的目标在冷却期内不再重选，避免同一个做不成的目标被反复拾起。
    if (cooling === template.id) continue;
    if (!startable(template, state)) continue;
    const plan = {
      agentId,
      goalId: template.id,
      goal: template.goal,
      stepIndex: 0,
      steps: template.steps.map((s) => ({ action: s.action, why: s.why })),
      attempts: 0,
      blockedTicks: 0,
      startTick: tick,
      deadlineTick: tick + template.timeBudget,
      timeBudget: template.timeBudget,
      maxAttempts: template.maxAttempts,
      status: 'active',
      suspendedTicks: 0,
      suspensions: 0,
      replans: 0,
      lastReason: null,
    };
    // 跳过开始时就已完成的步骤。
    let guard = 0;
    while (plan.stepIndex < template.steps.length
      && stepDone(template.steps[plan.stepIndex], state) && guard < 64) {
      plan.stepIndex += 1;
      guard += 1;
    }
    plans.set(agentId, plan);
    stats.started += 1;
    return plan;
  }
  return null;
}

function templateOf(plan) {
  return TEMPLATES[plan?.goalId] ?? null;
}

/** 放弃目标并进入冷却（避免同一 tick 反复重选同一个做不成的目标）。 */
function abandon(agentId, plan, tick, reason, transitions, cooldownTicks) {
  plan.status = 'abandoned';
  plan.lastReason = reason;
  plans.delete(agentId);
  cooldown.set(agentId, { until: tick + cooldownTicks, goalId: plan.goalId });
  stats.abandoned += 1;
  transition(transitions, 'abandoned', plan, { reason });
}

/**
 * 每 tick 的计划推进（在**决策之前**调用）。
 *
 * 职责：中断/恢复判定 → 超时判定 → 回退重规划 → 选出本 tick 建议的动作。
 *
 * @param {string} agentId
 * @param {number} tick
 * @param {object} state 真实居民状态（含 wood/surplus/needs/hasAccount/...）
 * @param {object} cfg 配置（goalWeight/goalMaxAttempts/goalCooldownTicks/危机阈值）
 * @param {object} contract decision.action-contract（动作前置条件的唯一事实来源）
 * @returns {{ plan: object|null, suggestion: object|null, transitions: Array<object> }}
 */
export function plan(agentId, tick, state, cfg = {}, contract, doomed = null) {
  const transitions = [];
  if (cfg.goalPlanningEnabled === false) {
    return { plan: plans.get(agentId) ?? null, suggestion: null, transitions };
  }
  const cooldownTicks = Number.isInteger(cfg.goalCooldownTicks) ? cfg.goalCooldownTicks : 12;

  // ---- 中断判定：生存危机挂起目标（不丢弃已完成的部分） ----
  const crisis = num(cfg.crisisNeedLevel) > 0 ? (cfg.crisisNeedLevel ?? 0.8) : 0.8;
  const foodLevel = num(state?.needs?.food);
  const waterLevel = num(state?.needs?.water);
  const emergency = foodLevel >= crisis || waterLevel >= crisis;

  let current = plans.get(agentId) ?? null;

  if (current !== null && emergency) {
    if (current.status === 'active') {
      current.status = 'suspended';
      current.suspendedSince = tick;
      stats.suspended += 1;
      transition(transitions, 'suspended', current, { reason: foodLevel >= crisis ? 'food_crisis' : 'water_crisis' });
    } else {
      current.suspendedTicks += 1;
    }
    // 危机期间目标不参与打分（返回 null 建议），居民先活下来。
    return { plan: current, suggestion: null, transitions };
  }
  if (current !== null && current.status === 'suspended') {
    current.status = 'active';
    if (typeof current.suspendedSince === 'number') {
      current.suspendedTicks += Math.max(0, tick - current.suspendedSince);
      delete current.suspendedSince;
    }
    current.suspensions += 1;
    stats.resumed += 1;
    transition(transitions, 'resumed', current, {});
  }

  // ---- 超时判定：时间预算用完则放弃（时间预算不是装饰，必须真的能终止） ----
  if (current !== null && tick > current.deadlineTick) {
    stats.expired += 1;
    transition(transitions, 'expired', current, { budget: current.timeBudget });
    abandon(agentId, current, tick, 'time_budget_exceeded', transitions, cooldownTicks);
    current = null;
  }

  // ---- 未达成则尝试选一个新目标 ----
  if (current === null) {
    current = select(agentId, tick, state);
    if (current === null) return { plan: null, suggestion: null, transitions };
    transition(transitions, 'started', current, { goal: current.goal, budget: current.timeBudget });
  }

  const template = templateOf(current);
  if (template === null) {
    abandon(agentId, current, tick, 'template_missing', transitions, cooldownTicks);
    return { plan: null, suggestion: null, transitions };
  }

  // ---- 推进：已完成的步骤不重做 ----
  let guard = 0;
  while (current.stepIndex < template.steps.length
    && stepDone(template.steps[current.stepIndex], state) && guard < 64) {
    current.stepIndex += 1;
    current.attempts = 0;
    current.blockedTicks = 0;
    stats.advanced += 1;
    transition(transitions, 'advanced', current, { action: template.steps[current.stepIndex - 1].action });
    guard += 1;
  }

  // ---- 全部步骤完成 = 目标达成 ----
  if (current.stepIndex >= template.steps.length) {
    current.status = 'achieved';
    stats.achieved += 1;
    transition(transitions, 'achieved', current, { goal: current.goal, ticks: tick - current.startTick });
    plans.delete(agentId);
    return { plan: current, suggestion: null, transitions };
  }

  // ---- 让位于**一次性机会窗口** ----
  // 计划可以等，机会窗口不能：有人正在等我答复时，错过这个 tick 就永远错过了，
  // 而计划步骤下一 tick 继续做完全不受损。
  // t12 实测（2 人 × 60 tick, seed 7）：不给这条规则时，本应接受表白的居民
  // 选了计划里的 craft（0.9 + goalWeight 0.35 = 1.25）而不是 accept（基础分 1.1），
  // 于是求偶永远无法闭环、生育链断裂。**计划步骤的加分不该盖过不可重来的机会。**
  // 注意：必须放在**达成判定之后**——否则会跳过「全部步骤完成 → 结项」的清理，
  // 把 stepIndex 留在越界位置（实测直接抛 TypeError）。
  if (state?.hasPendingCourt === true) {
    stats.yielded += 1;
    transition(transitions, 'yielded', current, { reason: 'one_shot_opportunity', action: 'accept' });
    return { plan: current, suggestion: null, transitions };
  }


  // ---- 回退重规划：当前步骤不可执行时，退回**最早的未完成且可执行**的步骤 ----
  let step = template.steps[current.stepIndex];
  if (!stepAdmissible(step, state, contract, doomed)) {
    // 先区分「办不了」与「上一件还没办完」。
    // 未满足的前置条件若指向**进行中的任务**（pendingCraft/pendingBuild/pendingWrite），
    // 那不是做不了，而是跨 tick 的工作还在跑：此时必须**等待**。
    // 重发会撞上 already_crafting；退回采料又会把刚备好的原料白白用掉。
    let unmet = [];
    try { unmet = contract.preconditionOf(step.action, state).unmet ?? []; } catch { unmet = []; }
    const inFlight = unmet.some((k) => typeof k === 'string' && k.startsWith('pending'));
    if (inFlight) {
      transition(transitions, 'waiting', current, { action: step.action, reason: 'in_flight_job' });
      return { plan: current, suggestion: null, transitions };
    }
    let moved = -1;
    for (let i = 0; i < current.stepIndex; i += 1) {
      const earlier = template.steps[i];
      if (stepDone(earlier, state)) continue;       // 已完成的步骤不重做
      if (!stepAdmissible(earlier, state, contract, doomed)) continue;
      moved = i;
      break;                                        // 最早的未完成且可执行者
    }
    if (moved >= 0) {
      current.stepIndex = moved;
      current.replans += 1;
      stats.replanned += 1;
      step = template.steps[moved];
      transition(transitions, 'replanned', current, { action: step.action, why: step.why });
    } else {
      // 既不能执行当前步骤，也退不回去：记账并等待（不硬发必然被拒的动作）。
      current.blockedTicks += 1;
      const maxAttempts = Number.isInteger(cfg.goalMaxAttempts) ? cfg.goalMaxAttempts : current.maxAttempts;
      if (current.blockedTicks > maxAttempts) {
        abandon(agentId, current, tick, 'blocked:' + step.action, transitions, cooldownTicks);
        return { plan: null, suggestion: null, transitions };
      }
      transition(transitions, 'blocked', current, { action: step.action, blockedTicks: current.blockedTicks });
      return { plan: current, suggestion: null, transitions };
    }
  }

  return {
    plan: current,
    suggestion: {
      action: step.action,
      goalId: current.goalId,
      goal: current.goal,
      stepIndex: current.stepIndex,
      stepCount: template.steps.length,
      why: step.why,
      weight: typeof cfg.goalWeight === 'number' && cfg.goalWeight >= 0 ? cfg.goalWeight : 0.35,
    },
    transitions,
  };
}

/**
 * 每 tick 的结果反馈（在**执行之后**调用，用实测结果与实测后的状态推进计划）。
 *
 * @param {string} agentId
 * @param {number} tick
 * @param {{ status: string, reason?: string|null, action?: string }} outcome 实测执行结果
 * @param {object} state 执行后的真实居民状态
 * @param {object} cfg
 * @returns {{ plan: object|null, transitions: Array<object> }}
 */
export function observe(agentId, tick, outcome, state, cfg = {}) {
  const transitions = [];
  const current = plans.get(agentId);
  if (current === null || current === undefined) return { plan: null, transitions };
  if (current.status !== 'active') return { plan: current, transitions };
  const template = templateOf(current);
  if (template === null) return { plan: current, transitions };

  const step = template.steps[current.stepIndex];
  const executed = outcome?.action ?? null;

  // 居民本 tick 做了别的事（目标只是建议，不剥夺居民的选择权）：
  // 记一次偏离，但不推进也不惩罚——下一 tick 会重新评估真实状态。
  if (executed !== null && executed !== step.action) {
    // 计数由 transition → count() 统一负责，此处不再手动累加（否则会双计）。
    transition(transitions, 'diverged', current, { planned: step.action, executed });
    return { plan: current, transitions };
  }

  // 用**实测后的真实状态**判定是否推进（不看命令是否发出）。
  if (stepDone(step, state)) {
    current.stepIndex += 1;
    current.attempts = 0;
    current.blockedTicks = 0;
    stats.advanced += 1;
    transition(transitions, 'advanced', current, { action: step.action });
    // 最后一步完成 = 目标达成：必须在此结项并移除计划。
    // 若只自增 stepIndex 而不清理，计划会带着越界的 stepIndex 留在表里，
    // 下一次 observe 读 template.steps[stepIndex] 就是 undefined（实测抛 TypeError）。
    if (current.stepIndex >= template.steps.length) {
      current.status = 'achieved';
      stats.achieved += 1;
      transition(transitions, 'achieved', current, { goal: current.goal, ticks: tick - current.startTick });
      plans.delete(agentId);
      return { plan: current, transitions };
    }
    return { plan: current, transitions };
  }

  // 未达成：按实测结果分类处理。
  const status = outcome?.status ?? 'unknown';
  if (status === 'applied' || status === 'started' || status === 'planned') {
    // 动作真的生效了，只是效果需要跨 tick 才体现（例如制作任务是 pending 的）。
    // 这里**等待**而不是重发——重发会撞上 already_crafting / already_writing。
    transition(transitions, 'waiting', current, { action: step.action, status });
    return { plan: current, transitions };
  }

  // noop / failed / unknown：动作没有产生效果，记一次尝试；超限则放弃目标。
  current.attempts += 1;
  const maxAttempts = Number.isInteger(cfg.goalMaxAttempts) ? cfg.goalMaxAttempts : current.maxAttempts;
  if (current.attempts > maxAttempts) {
    abandon(agentId, current, tick, 'step_failed:' + step.action + ':' + String(outcome?.reason ?? status), transitions,
      Number.isInteger(cfg.goalCooldownTicks) ? cfg.goalCooldownTicks : 12);
    return { plan: null, transitions };
  }
  transition(transitions, 'retry', current, { action: step.action, status, reason: outcome?.reason ?? null, attempts: current.attempts });
  return { plan: current, transitions };
}

/** 当前计划（无则 null），供测试与观测。 */
export function active(agentId) {
  const p = plans.get(agentId);
  return p === undefined ? null : { ...p };
}

/** 丢弃不在 aliveIds 中的计划（死亡居民不留残影）。 */
export function prune(aliveIds) {
  const alive = aliveIds instanceof Set ? aliveIds : new Set(Array.isArray(aliveIds) ? aliveIds : []);
  let dropped = 0;
  for (const id of [...plans.keys()]) {
    if (!alive.has(id)) { plans.delete(id); dropped += 1; }
  }
  for (const id of [...cooldown.keys()]) {
    if (!alive.has(id)) cooldown.delete(id);
  }
  return dropped;
}

/** 汇总统计（活跃计划数 / 各状态计数 / 累计转移）。 */
export function summary() {
  const byGoal = {};
  for (const p of plans.values()) byGoal[p.goalId] = (byGoal[p.goalId] ?? 0) + 1;
  return {
    active: plans.size,
    byGoal,
    started: stats.started,
    achieved: stats.achieved,
    abandoned: stats.abandoned,
    expired: stats.expired,
    suspended: stats.suspended,
    resumed: stats.resumed,
    advanced: stats.advanced,
    replanned: stats.replanned,
    yielded: stats.yielded,
    // 例行转移只计数（不产事件）：它们是常态而非异常，逐条写事件会淹没日志。
    diverged: stats.diverged,
    waiting: stats.waiting,
    blocked: stats.blocked,
    retried: stats.retried,
  };
}

/** 目标模板快照（供测试逐条核对前置条件与完成判据）。 */
export function templates() {
  return TEMPLATES;
}

/**
 * 采集目标引擎的全部模块级状态（t22）。
 *
 * 为什么必须入档：plans / cooldown / stats 是**跨 tick 存活**的状态——
 * 计划带着 stepIndex（走到第几步）、deadlineTick（时间预算）、attempts（尝试次数），
 * 冷却带着 until（何时可以再选同一目标）。不入档则续跑时：
 *   - 在办计划凭空消失 → 居民重新从第 0 步开始，已完成的部分重做；
 *   - 冷却窗口消失 → 刚放弃的目标被立刻重选，「不反复拾起做不成的目标」失效；
 *   - 统计归零 → 目标达成/重规划次数与连续运行不可比。
 * 这与 t3 记录的 outcome-model 缺档是同一类缺陷（逐 tick 累积、直接参与决策，
 * 却只在内存里），实测都会在恢复后的第 5~6 tick 起让行动选择本身分叉。
 *
 * @returns {{plans: Array, cooldown: Array, stats: object}}
 */
export function __snapshot() {
  return {
    plans: [...plans.entries()].map(([agentId, p]) => ({ agentId, plan: structuredClone(p) })),
    cooldown: [...cooldown.entries()].map(([agentId, c]) => ({ agentId, ...structuredClone(c) })),
    stats: { ...stats },
  };
}

/** 解析一个整数，非法则取默认值（入档数据可能来自旧版本或手工构造）。 */
function intOr(v, dflt) {
  return Number.isInteger(v) ? v : dflt;
}

/**
 * 恢复目标引擎状态（整体替换，不做增量合并）。
 *
 * 整体替换而非合并：存档表达的是"那一刻的完整状态"，合并会把恢复前残留的
 * 计划留在表里，使结果取决于"此前跑过什么"。
 * @param {object} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('goals.__restore: 状态必须为对象');
  }
  plans.clear();
  cooldown.clear();
  for (const rec of (Array.isArray(data.plans) ? data.plans : [])) {
    if (rec === null || typeof rec !== 'object') continue;
    const agentId = rec.agentId;
    const p = rec.plan;
    // 只接受结构完整的计划：残缺计划会让 plan() 读到 undefined 的 stepIndex，
    // 静默走错分支——比直接丢弃更难查。
    if (typeof agentId !== 'string' || agentId === '') continue;
    if (p === null || typeof p !== 'object' || typeof p.goalId !== 'string') continue;
    if (!Array.isArray(p.steps) || p.steps.length === 0) continue;
    plans.set(agentId, {
      ...structuredClone(p),
      agentId,
      stepIndex: intOr(p.stepIndex, 0),
      attempts: intOr(p.attempts, 0),
      blockedTicks: intOr(p.blockedTicks, 0),
      startTick: intOr(p.startTick, 0),
      deadlineTick: intOr(p.deadlineTick, 0),
      suspendedTicks: intOr(p.suspendedTicks, 0),
      suspensions: intOr(p.suspensions, 0),
      replans: intOr(p.replans, 0),
      status: typeof p.status === 'string' ? p.status : 'active',
    });
  }
  for (const rec of (Array.isArray(data.cooldown) ? data.cooldown : [])) {
    if (rec === null || typeof rec !== 'object') continue;
    if (typeof rec.agentId !== 'string' || rec.agentId === '') continue;
    cooldown.set(rec.agentId, {
      until: intOr(rec.until, 0),
      goalId: typeof rec.goalId === 'string' ? rec.goalId : null,
    });
  }
  const s = data.stats;
  for (const k of Object.keys(stats)) {
    stats[k] = (s !== null && typeof s === 'object') ? Math.max(0, intOr(s[k], 0)) : 0;
  }
  return { plans: plans.size, cooldown: cooldown.size };
}

/** 复位（跨 run 不残留计划、冷却与统计）。 */
export function __reset() {
  plans.clear();
  cooldown.clear();
  for (const k of Object.keys(stats)) stats[k] = 0;
}
