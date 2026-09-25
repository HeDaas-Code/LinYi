/**
 * truman-town.agent.decision.candidates — 候选生成器 / Candidate Planner
 *
 * 按居民**真实状态**动态生成可执行行动候选（而非出生时固定的 4 个）。
 * 这是「行动空间地基」：没有它，智能体的选择只可能是 eat/drink/rest/forage；
 * 有了它，制作/建造/写书/上工/交易/社交才第一次成为居民的选择而非代码的指派。
 *
 * 纯函数、无副作用、不读图：状态由调用方（主循环）组装传入，便于单测与消融。
 */

/** 每个动态行动的准入规则（可解释：为什么这个候选出现了）。 */
const RULES = Object.freeze({
  craft: (s) => (s.hasWorkbenchMaterial ? '背包材料够做一把工具' : null),
  build: (s) => (s.hasBuildingMaterial ? '背包材料够盖一座谷仓' : null),
  write: (s) => (s.literate ? '已识字，可以写书记录避难所历史' : null),
  work: (s) => (s.employed && s.businessActive ? '受雇于企业，上工可产出商品' : null),
  trade: (s) => (s.hasSurplus ? '背包有余粮，可以卖掉换钱' : null),
  socialize: (s) => (s.hasPeer ? '附近有其他居民，可以交谈' : null),
  court: (s) => (s.eligibleMate && s.hasPeer ? '有合适的对象，可以求偶' : null),
  accept: (s) => (s.hasPendingCourt ? '有人向我表白，可以接受' : null),
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
  // 探索基础分略低于日常劳动：它应该是在"资源紧张"或"有余力"时才被选中，
  // 而不是无脑优先。风险与收益的具体权衡在 scoreAction 里按需叠加。
  expedition: 0.75,
});

const ALL_ACTIONS = Object.freeze(['eat', 'drink', 'rest', 'forage', ...Object.keys(RULES)]);

function num(v, dflt) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : dflt;
}

/**
 * 生成候选行动列表。
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

  // 生存骨架：永远可选（不可行时效果为空操作，不产生资源）
  push('eat', num(s.eatScore, 0.3), null);
  push('drink', num(s.drinkScore, 0.3), null);
  push('rest', num(s.restScore, 0.2), null);
  push('forage', num(s.forageScore, 0.2), null);

  if (s.actionSpaceEnabled === false) return out;

  for (const [action, rule] of Object.entries(RULES)) {
    let because = null;
    try { because = rule(s); } catch { because = null; }
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

/** 准入规则快照（行动 → 规则函数），供测试逐条验证「什么状态下出现什么候选」。 */
export function rules() {
  return { ...RULES };
}

/** 基础分快照。 */
export function baseScores() {
  return { ...BASE_SCORE };
}
