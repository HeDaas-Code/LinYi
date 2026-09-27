/**
 * truman-town.agent.decision.candidates — 候选生成器 / Candidate Planner
 *
 * 按居民**真实状态**动态生成可执行行动候选（而非出生时固定的 4 个）。
 * 这是「行动空间地基」：没有它，智能体的选择只可能是 eat/drink/rest/forage；
 * 有了它，制作/建造/写书/上工/交易/社交才第一次成为居民的选择而非代码的指派。
 *
 * t11 修正：**候选准入必须与执行器的前置条件同源**。
 * 此前本文件的 RULES 只看得到"有没有材料/识不识字"，而执行器还会拒绝
 * "已有进行中任务"（already_crafting / already_building / already_writing）。
 * 两者不一致的后果实测：40 人 × 60 tick 中 write 被选中 131 次，
 * **115 次以 already_writing 失败**、仅 16 次真正发起——88% 的写作选择是空转。
 * 现在 RULES 只负责**人读理由**（because），准入判定统一交给
 * decision.action-contract 的 preconditionOf（与执行器同一套判据）。
 *
 * t21 修正：**契约故障必须可见**。
 * 上面那个准入还留着一个静默陷阱——旧实现用
 *   `try { pre = preconditionOf(action, s) } catch { pre = { ok: false } }`
 * 兜底，把"契约不可用（导出缺失 / 内部抛错）"当成"前置条件不满足"。
 * 后果（t19 的归因实验逐条复现过）：契约一旦不可用，**全部动态行动**
 * （court/accept/build/craft/write/work/found/trade）被静默移除，
 * 候选只剩 eat/drink/rest/forage。故障不崩、不报错，主循环照常跑，
 * 只在几百 tick 之后的下游行为断言（"没有子代"）上才暴露。
 * 现在：合法的不满足照常过滤且**不告警**；契约故障照常过滤但**必留可查询的告警**
 * （contractFaults / contractFaultSummary，见下）。两者必须能分开，否则等于没修。
 *
 * 关于"纯函数"：本模块对**世界**仍然无副作用——不写图、不改居民状态、不读时钟。
 * 唯一的例外是契约故障时往本模块自己的诊断账本写一条记录：那是**程序缺陷**的
 * 记录，不是世界状态的一部分。为了保持"纯"而把故障吞掉，正是本任务要消灭的东西。
 */

import { preconditionOf, contractOf } from './action-contract.js';

/** 契约故障的告警种类（供验收按种类断言）。 */
export const CONTRACT_FAULT = 'decision.contract_fault';

// ---------------------------------------------------------------------------
// 契约故障账本 / Contract Fault Ledger
//
// 为什么需要一条**不依赖 tick** 的告警通道：
// 契约故障不属于世界里发生的任何一件事，因此没有 tick 可以挂。它是**程序缺陷**，
// 不是"世界里条件没满足"。而候选生成是纯函数、拿不到 tick（调用方组装的状态里
// 没有它——这是 t11 刻意的设计，决策层不读时钟/世界状态）。为了挂 tick 而破坏
// 该性质得不偿失，因此这里按 kind|subject|message 去重、有界、可查询。
//
// 去重是**必需的**：plan() 每 tick 每居民调用一次，契约坏了会瞬间产生上万条
// 相同告警。逐条记录等于没有告警，还会打满事件日志的热区上限（1500）。
// ---------------------------------------------------------------------------

/** 不同告警键的上限。超出后只累计总数，不再登记新键——保证内存有界。 */
const MAX_DISTINCT_FAULTS = 64;

/** key -> 故障记录（**内部可变**；对外只给冻结快照）。 */
const faultLedger = new Map();

/** 全部故障**次数**（含被去重的重复次数）。 */
let faultTotal = 0;

/** 因超出不同键上限而未能登记的**次数**。 */
let faultOverflow = 0;

/** 记录失败次数（诊断通道自身不可用时也不许静默，见 noteContractFault）。 */
let faultReportFailures = 0;

/** 内部可变记录 → 对外冻结快照（调用方改不动内部状态）。 */
function faultSnapshotOf(rec) {
  return Object.freeze({
    kind: rec.kind,
    subject: rec.subject,
    message: rec.message,
    detail: rec.detail === null ? null : { ...rec.detail },
    count: rec.count,
    firstAt: rec.firstAt,
    lastAt: rec.lastAt,
  });
}

/** 每个动态行动的**人读理由**（为什么这个候选对居民有意义）。 */
const RULES = Object.freeze({
  craft: (s) => (s.hasWorkbenchMaterial ? '背包材料够做一把工具' : null),
  build: (s) => (s.hasBuildingMaterial ? '背包材料够盖一座谷仓' : null),
  write: (s) => (s.literate ? '已识字，可以写书记录避难所历史' : null),
  work: (s) => (s.employed && s.businessActive ? '受雇于企业，上工可产出商品' : null),
  // 创办企业：有足够自有资本且市场还有空位（D2）。
  // 两个条件是**并列**的：够本 + 有空位。
  // 只看够本会让居民一窝蜂开铺子，而需求池只能养活 1 家（50 人 × 0.12 ÷ 单产 4），
  // 后来者必然持续亏损直至破产——实测破产 655 次。
  found: (s) => (s.canFound && s.marketRoom !== false
    ? '手头有 ' + Math.round(s.foundCapital ?? 0) + ' 本金，且市场尚有空位，可以盘一间铺子'
    : null),
  trade: (s) => (s.hasSurplus ? '背包有余粮，可以卖掉换钱' : null),
  socialize: (s) => (s.hasPeer ? '附近有其他居民，可以交谈（需对方回应才成关系）' : null),
  court: (s) => (s.eligibleMate && s.hasPeer ? '有合适的对象，可以求偶' : null),
  accept: (s) => (s.hasPendingInteraction ? '有人向我表白，可以接受' : null),
  // t13：拒绝与接受**成对**存在。只有 accept 没有 reject 不是双向互动——
  // 那是"被表白者除了答应别无选择"，等于代码替人做主。
  reject: (s) => (s.hasPendingInteraction ? '有人向我提出请求，可以拒绝' : null),
  promise: (s) => (s.hasPeer ? '可以向邻居许诺一份物资（承诺可查、可履约、可违约）' : null),
  fulfill: (s) => (s.canFulfillPromise ? '手头的货够，可以兑现此前的承诺' : null),
  // 违约只在**欠着且交不出**时才是可选项：它是有社会代价的退路，不是常规动作。
  violate: (s) => (s.hasOpenPromise && !s.canFulfillPromise
    ? '此前答应的事交不出来了，只能失信' : null),
  // 探索：可行性与预期收益由 survival.environment.expedition.plan 评估后注入。
  // 外出是**有代价的高收益**行动——风险高但能带回本地无法生产的物资。
  expedition: (s) => (s.expeditionViable && s.expeditionRisk < 0.85
    ? '可以外出探索废墟（风险 ' + Math.round((s.expeditionRisk ?? 0) * 100) + '%，预计拾获 ' + (s.expeditionLoot ?? 0) + ' 项）'
    : null),
});

/** 行动 → 基础分（在 scoreAction 再叠加需求/稀缺/性格/记忆修正）。 */
const BASE_SCORE = Object.freeze({
  craft: 0.9,
  build: 0.8,
  write: 0.7,
  work: 1.0,
  trade: 0.8,
  socialize: 0.7,
  court: 0.85,
  // 接受表白是**一次性的窗口**（对方在等答复），给高于日常劳动的优先级。
  accept: 1.1,
  // 回应窗口同样是一次性的：拒绝也要及时给出，不能悬着。
  // 与 accept 同档（1.05）：**给出答复**比继续干活更紧迫——对方在等，
  // 悬而不决会让"请求—回应"这个闭环在生产里根本不闭合（实测 80 tick 内 40 条待决互动、0 次回应）。
  reject: 1.05,
  // 许诺是低成本的关系投资，略低于社交。
  promise: 0.55,
  // 履约优先级最高：欠着别人的事不还，社会结构就会烂掉。
  fulfill: 1.15,
  // 违约是**最后手段**：基础分明显低于其他社会行动，
  // 只有在"交不出货 + 被需求逼到墙角"时才可能被选中。
  violate: 0.3,
  // 探索基础分略低于日常劳动：它应该是在"资源紧张"或"有余力"时才被选中，
  // 而不是无脑优先。风险与收益的具体权衡在 scoreAction 里按需叠加。
  expedition: 0.75,
  // 创办企业是**机会性**行为：低于日常劳动（1.0），
  // 只有在生计有余力时才应被选中，不应压过谋生。
  found: 0.6,
});

const ALL_ACTIONS = Object.freeze(['eat', 'drink', 'rest', 'forage', ...Object.keys(RULES)]);

function num(v, dflt) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : dflt;
}

/**
 * 记录一次契约故障告警。去重由 observer.diagnostics 负责——这是必需的：
 * plan() 每 tick 每居民调用一次，契约坏了会瞬间产生上万条相同告警，
 * 逐条记录等于没有告警，还会打满事件日志的热区上限（1500 条）。
 *
 * @param {string} action 受影响行动
 * @param {string} key 契约内部的故障点（require 名 / precondition_threw / rule_threw）
 * @param {string} message 原始错误信息
 */
function noteContractFault(action, key, message) {
  try {
    const text = key + ': ' + (message === '' || message === undefined ? '(no message)' : message);
    const mapKey = CONTRACT_FAULT + '|' + action + '|' + text;
    const now = Date.now();
    faultTotal += 1;
    const existing = faultLedger.get(mapKey);
    if (existing !== undefined) {
      // 内部记录**必须可变**（这里要累加计数），对外只给冻结快照。
      // 首版曾把内部记录本身冻结，结果这里在严格模式（ESM）下抛 TypeError，
      // 被下面的 catch 吞掉——"去重后计数不再增长"，正好把本任务要消灭的
      // 静默吞错搬到了自己的告警通道里。内部可变 / 对外冻结必须分开。
      existing.count += 1;
      existing.lastAt = now;
      return;
    }
    if (faultLedger.size >= MAX_DISTINCT_FAULTS) {
      // 有界：不再登记新键，但**绝不假装没发生**——总数与溢出数都会如实累计。
      faultOverflow += 1;
      return;
    }
    faultLedger.set(mapKey, {
      kind: CONTRACT_FAULT,
      subject: action,
      message: text,
      detail: { action, require: key, error: message ?? null },
      count: 1,
      firstAt: now,
      lastAt: now,
    });
  } catch {
    // 告警通道自身不可用时**不能**反过来打断决策——那是把诊断变成新的故障源。
    // 但也绝不假装没发生：失败次数照样可查（contractFaultSummary().reportFailures）。
    faultReportFailures += 1;
  }
}

/**
 * 生成候选行动列表。
 *
 * 准入 = 契约前置条件（与执行器同源） ∧ 人读理由存在。
 * 前置条件不过 → 该行动**不出现**在居民面前，因此不会产生"选了必然被拒"的空转。
 *
 * @param {object} state 由主循环组装的居民状态
 * @param {{ attributeRandom?: boolean }} [opts]
 * @returns {Array<{ id: string, action: string, score: number, because: string|null }>}
 */
export function plan(state = {}, opts = {}) {
  const s = state ?? {};
  const out = [];
  const push = (action, score, because) => {
    out.push({ id: 'cand:' + action, action, score, because: because ?? null });
  };

  // 生存骨架：永远可选。注意它们**没有**决策时刻的前置条件——
  // 库存/采集池是否为空只能在执行时才知道（契约的 mayFail 声明了这一点），
  // 因此这里不做准入过滤，而由预想的争用感知（poolRemaining）与执行侧 noop 记账兜住。
  push('eat', num(s.eatScore, 0.3), null);
  push('drink', num(s.drinkScore, 0.3), null);
  push('rest', num(s.restScore, 0.2), null);
  push('forage', num(s.forageScore, 0.2), null);

  if (s.actionSpaceEnabled === false) return out;

  for (const [action, rule] of Object.entries(RULES)) {
    // 1) 契约前置条件（与执行器同一套判据）：不满足则候选不出现。
    let pre;
    try {
      pre = preconditionOf(action, s);
    } catch (err) {
      // 契约**不可用**（导出缺失 / 内部抛错）：这是程序缺陷，不是"条件不满足"。
      // 保守起见仍不放行（不去执行无法校验的行动），但必须留下可查询的告警。
      noteContractFault(action, 'precondition_threw',
        err instanceof Error ? err.message : String(err));
      continue;
    }
    // 契约内部暴露的故障（某个 requires 的测试函数抛错、requires 结构损坏）。
    // 这些同样会让行动被过滤，因此同样不能静默。
    if (Array.isArray(pre.faults) && pre.faults.length > 0) {
      for (const f of pre.faults) {
        noteContractFault(action, f.key ?? 'unknown', f.message ?? '');
      }
    }
    if (pre.ok !== true) continue;
    // 2) 人读理由：给居民与观测者一个"为什么现在能做这件事"的解释。
    let because = null;
    try {
      because = rule(s);
    } catch (err) {
      // 理由函数抛错同样是缺陷：此前它静默等于"没理由"，行动被悄悄移除。
      noteContractFault(action, 'rule_threw', err instanceof Error ? err.message : String(err));
      continue;
    }
    if (because === null) continue;
    push(action, BASE_SCORE[action] ?? 0.5, because);
  }

  if (opts.attributeRandom === true) {
    // 归因测试：把「决定者」从状态规则换成随机，用于反证产出是否真由决策驱动。
    for (const c of out) c.score = 0.5;
  }
  return out;
}

/** 全部可能的行动名（供测试与文档核对行动空间大小）。 */
export function actions() {
  return [...ALL_ACTIONS];
}

/** 准入理由快照（行动 → 理由函数），供测试逐条验证「什么状态下出现什么候选」。 */
export function rules() {
  return { ...RULES };
}

/** 基础分快照。 */
export function baseScores() {
  return { ...BASE_SCORE };
}

/**
 * 候选准入的**唯一判据**（= 契约前置条件）。
 * 导出供测试直接断言「候选出现 ⟺ 执行器接受」。
 * @param {unknown} action
 * @param {object} state
 * @returns {{ ok: boolean, reason: string|null, unmet: string[] }}
 */
export function admission(action, state = {}) {
  return preconditionOf(action, state);
}

/** 该行动是否有契约建模（无建模者不应出现在候选里）。 */
export function modeled(action) {
  return contractOf(action).known === true;
}

/**
 * 契约故障告警快照——"契约坏了"的**唯一可查询入口**。
 *
 * 关键区分：合法的不满足（ok:false 且无故障）**不会**出现在这里。
 * 因此"候选里少了某个行动"到底是因为"条件没到"还是"契约坏了"，
 * 从此可以一眼分开；这正是 t19 归因时不得不靠隔离沙箱才能做到的事。
 *
 * @returns {Array<{kind: string, subject: string, message: string, detail: object|null, count: number}>}
 */
export function contractFaults() {
  return [...faultLedger.values()].map(faultSnapshotOf);
}

/**
 * 契约故障汇总（供验收断言与运行报告）。
 * @returns {{ total: number, distinct: number, overflow: number, reportFailures: number, clean: boolean }}
 */
export function contractFaultSummary() {
  return {
    total: faultTotal,
    distinct: faultLedger.size,
    overflow: faultOverflow,
    reportFailures: faultReportFailures,
    clean: faultTotal === 0,
  };
}

/**
 * 清空契约故障账本。
 *
 * 账本是**跨 run 会污染判断**的状态：上一局的契约故障若不清，新一局会一开始
 * 就报"契约坏了"，把真正的故障淹掉（hot-log 的跨 run 泄漏就是同一类问题）。
 *
 * 注意（如实说明，供收口判断）：loop.reset 目前**不会**调用本函数——它按模块
 * 逐个 __reset，而 loop.js 不在本任务的改动范围内。因此本函数当前由测试显式调用；
 * 把它接进 loop.reset 只需在 loop.js 的复位清单里加一行 candidates.__reset()。
 * 在此之前，同一进程内多次 run 会共用账本（诊断计数会累加），但**不影响行为正确性**
 * ——账本只增不减地记录故障，不参与候选打分与准入判定。
 */
export function __reset() {
  faultLedger.clear();
  faultTotal = 0;
  faultOverflow = 0;
  faultReportFailures = 0;
}

// 告警的**复位**不在这里做：loop.reset → observer.recorder.__reset() → diagnostics.__reset()。
// 走那条路径而不是在决策层自己清，是为了让"跨 run 会残留的观察者状态"只有一处清理点，
// 避免以后新增调用方时漏掉一处（hot-log 的跨 run 泄漏就是这么来的）。

