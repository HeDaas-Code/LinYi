/**
 * truman-town.agent.decision.action-contract — 行动契约 / Shared Action Contract
 *
 * **单一事实来源**：一个行动的目标、前置条件、成本、收益、风险、时长、资源争用
 * 与成败结果只能在这里定义，由下列四处共同消费：
 *   1. decision.candidates  —— 候选准入（什么状态下这个行动该出现在居民面前）
 *   2. anticipation.simulator —— 预想/推演（选中它会带来什么）
 *   3. runtime 执行器（_stage2.performAgentAction / loop.effectFor）—— 真实执行
 *   4. agent.schedule.*     —— 日程建议（建议的行动必须真实可行）
 *
 * 为什么必须共享（t11 证据）：
 * 此前四处各写一套行动知识，实测产生三类系统性缺陷：
 *   a) **候选与执行器前置条件不一致**：candidates 的 write 规则只看 literate，
 *      而执行器在已有进行中任务时拒绝（already_writing）。实测 40 人 × 60 tick：
 *      write 被选中 131 次，其中 **115 次以 already_writing 失败**、仅 16 次真正发起
 *      —— 88% 的写作选择是无效选择。
 *   b) **共享资源被重复预支**：forage 的 effect 从全局 foragePool 取料，
 *      但预想只看稀缺度、看不到池余量。实测同一 tick 内 forage 结果在 dispatch 顺序上
 *      严格呈「前缀成功、后缀失败」：t2 前 25 人 applied、后 6 人 noop；
 *      t5 前 13 applied、后 14 noop。整体 608 次采集中 198 次（33%）以
 *      forage_pool_empty 空转——居民基于过期池况做了 198 次注定失败的决策。
 *   c) **动作分类散落**：生存/非生存清单在 loop 里硬编码两份
 *      （SURVIVAL_ACTIONS / NON_SURVIVAL），与 candidates 的 RULES 构成第三份，
 *      任一处新增行动都会静默漏配。
 *
 * 契约语义（每条都必须可解释，不得凭感觉填）：
 * - known=false：该行动**未被契约建模**。预想必须显式标未知
 *   （risk=null / expectedUtility=null），不得当成零风险零收益。
 * - simulatable=false：行动已建模，但其**收益无法数值化预测**（社交/经济/结构性产出）。
 *   预想必须返回显式 unknown（expectedUtility=null、unknownFields 列出未建模维度），
 *   不得伪造一个数字，也不得默认为零。
 * - requires：前置条件（全部必须成立）。reason 与执行器的拒绝原因**逐字对齐**，
 *   使「候选出现」与「执行被接受」可以机械对账。
 * - mayFail：执行期才可能出现的失败原因（决策时刻无法排除，如库存见底、账本余额不足）。
 * - contention：该行动对**共享池**的争用方式。
 * - success/failure：声明式结果形状，供日志与记忆引用。
 *
 * 纯数据 + 纯函数，无副作用、不读图，便于单测与对账。
 */

/** 争用方式枚举。 */
export const CONTENTION = Object.freeze({
  NONE: 'none',
  /** 从可耗尽的共享池按 dispatch 顺序取用（先到先得）——顺序偏置的来源。 */
  SHARED_DRAW: 'shared-draw',
  /** 受共享额度限制（金库余额、市场空位）——超发即失败。 */
  QUOTA: 'quota',
  /** 占用唯一对象（配偶名额）——先占者胜，后者被拒。 */
  EXCLUSIVE: 'exclusive',
});

/** 共享池标识（供 contention 账本与审计统一引用）。 */
export const POOLS = Object.freeze({
  FORAGE: 'foragePool',
  FOOD: 'foodStock',
  WATER: 'waterStock',
  SUPPLY_MONEY: 'supplyMoney',
  MARKET_ROOM: 'marketRoom',
  MATE: 'matePool',
  BUSINESS_LABOUR: 'businessLabour',
});

/**
 * 前置条件构造器：reason 必须与执行器的拒绝原因逐字一致。
 * @param {string} key 状态字段名
 * @param {string} reason 执行器的拒绝原因
 * @param {(state: object) => boolean} test
 * @param {string} zh 人读说明
 */
function req(key, reason, test, zh) {
  return Object.freeze({ key, reason, test, zh });
}

/** 生存骨架 + 动态行动的完整契约。 */
export const CONTRACTS = Object.freeze({
  // ---- 生存骨架（可数值模拟：需求变化与资源消耗都是确定数） ----
  eat: Object.freeze({
    action: 'eat', kind: 'sustain', goal: 'sustain-need',
    known: true, simulatable: true, unknownFields: Object.freeze([]),
    completes: true, direction: null,
    needsDelta: Object.freeze({ food: -0.5, water: 0 }),
    consumes: Object.freeze({ food: 1 }), produces: Object.freeze({}),
    risk: 0, durationTicks: 1,
    requires: Object.freeze([]),
    mayFail: Object.freeze(['no_food_stock']),
    contention: Object.freeze({ pool: POOLS.FOOD, mode: CONTENTION.SHARED_DRAW }),
    success: 'need_relieved', failure: 'no_resource',
  }),
  drink: Object.freeze({
    action: 'drink', kind: 'sustain', goal: 'sustain-need',
    known: true, simulatable: true, unknownFields: Object.freeze([]),
    completes: true, direction: null,
    needsDelta: Object.freeze({ food: 0, water: -0.5 }),
    consumes: Object.freeze({ water: 1 }), produces: Object.freeze({}),
    risk: 0, durationTicks: 1,
    requires: Object.freeze([]),
    mayFail: Object.freeze(['no_water_stock']),
    contention: Object.freeze({ pool: POOLS.WATER, mode: CONTENTION.SHARED_DRAW }),
    success: 'need_relieved', failure: 'no_resource',
  }),
  rest: Object.freeze({
    action: 'rest', kind: 'sustain', goal: 'recover',
    known: true, simulatable: true, unknownFields: Object.freeze([]),
    completes: true, direction: null,
    needsDelta: Object.freeze({ food: -0.1, water: -0.1 }),
    consumes: Object.freeze({}), produces: Object.freeze({}),
    risk: 0, durationTicks: 1,
    requires: Object.freeze([]),
    mayFail: Object.freeze([]),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: 'rested', failure: null,
  }),
  forage: Object.freeze({
    action: 'forage', kind: 'sustain', goal: 'acquire-resource',
    known: true, simulatable: true, unknownFields: Object.freeze([]),
    completes: true, direction: null,
    // 需求变化取决于当 tick 采集池余量（执行侧实测），契约给形状不给常数。
    needsDelta: Object.freeze({ food: 0, water: 0 }),
    consumes: Object.freeze({}), produces: Object.freeze({ food: 1, water: 1 }),
    risk: 0.15, durationTicks: 1,
    requires: Object.freeze([]),
    mayFail: Object.freeze(['forage_pool_empty']),
    // 采集池是**全局共享且可耗尽**的：同一 tick 内先取者得，后取者空手。
    contention: Object.freeze({ pool: POOLS.FORAGE, mode: CONTENTION.SHARED_DRAW }),
    success: 'resource_gained', failure: 'pool_exhausted',
  }),

  // ---- 动态行动：已建模，但收益是结构性的，无法数值化预测 ----
  // craft/build/write 都是**发起一个任务**，任务由 stage2 队列在后续 tick 推进并完成。
  // completes=false：发起成功不等于当 tick 有产出。
  craft: Object.freeze({
    action: 'craft', kind: 'produce', goal: 'produce-item',
    known: true, simulatable: false, unknownFields: Object.freeze(['itemGain', 'completionTick']),
    completes: false, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({ wood: 2 }),
    produces: Object.freeze({ tool: 1 }), risk: 0.05, durationTicks: 1,
    requires: Object.freeze([
      req('hasWorkbenchMaterial', 'craft_failed:insufficient_material', (s) => s.hasWorkbenchMaterial === true, '背包里有足够材料'),
      req('pendingCraft', 'already_crafting', (s) => s.pendingCraft !== true, '没有正在进行的制作'),
    ]),
    mayFail: Object.freeze(['craft_failed']),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: 'job_started', failure: 'job_rejected',
  }),
  build: Object.freeze({
    action: 'build', kind: 'produce', goal: 'produce-structure',
    known: true, simulatable: false, unknownFields: Object.freeze(['structureGain', 'completionTick']),
    completes: false, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({ wood: 3 }),
    produces: Object.freeze({ building: 1 }), risk: 0.05, durationTicks: 1,
    requires: Object.freeze([
      req('hasBuildingMaterial', 'build_failed:insufficient_material', (s) => s.hasBuildingMaterial === true, '背包里有足够建材'),
      req('pendingBuild', 'already_building', (s) => s.pendingBuild !== true, '没有正在进行的建造'),
    ]),
    mayFail: Object.freeze(['build_failed']),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: 'job_started', failure: 'job_rejected',
  }),
  write: Object.freeze({
    action: 'write', kind: 'produce', goal: 'produce-knowledge',
    known: true, simulatable: false, unknownFields: Object.freeze(['bookGain', 'completionTick']),
    completes: false, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({}),
    produces: Object.freeze({ book: 1 }), risk: 0, durationTicks: 1,
    requires: Object.freeze([
      req('literate', 'write_failed:illiterate', (s) => s.literate === true, '已识字'),
      // t11 核心修复：执行器在已有进行中写作时拒绝（already_writing）。
      // 候选侧此前不检查该条件，实测 88% 的写作选择以 already_writing 失败。
      req('pendingWrite', 'already_writing', (s) => s.pendingWrite !== true, '没有正在进行的写作'),
    ]),
    mayFail: Object.freeze(['write_failed']),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: 'job_started', failure: 'job_rejected',
  }),
  work: Object.freeze({
    action: 'work', kind: 'plan', goal: 'earn-wage',
    known: true, simulatable: false, unknownFields: Object.freeze(['goodsProduced', 'wage', 'completionTick']),
    completes: false, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({}),
    produces: Object.freeze({}), risk: 0, durationTicks: 1,
    requires: Object.freeze([
      req('employed', 'not_employed', (s) => s.employed === true, '受雇于某企业'),
      req('businessActive', 'not_employed', (s) => s.businessActive === true, '雇主企业处于活跃状态'),
    ]),
    mayFail: Object.freeze(['work_failed']),
    contention: Object.freeze({ pool: POOLS.BUSINESS_LABOUR, mode: CONTENTION.QUOTA }),
    success: 'plan_created', failure: 'not_employed',
  }),
  // trade 的真实语义是**单向卖出**：把背包里除制作原料外的全部产出品一次性卖给
  // 供应池换取货币。没有「买入」路径。契约据实声明 direction='sell'，
  // 不假装它是对称的买卖。
  trade: Object.freeze({
    action: 'trade', kind: 'exchange', goal: 'convert-goods-to-money',
    known: true, simulatable: false, unknownFields: Object.freeze(['revenue', 'price']),
    completes: true, direction: 'sell',
    needsDelta: Object.freeze({}), consumes: Object.freeze({ goods: 1 }),
    produces: Object.freeze({ money: 1 }), risk: 0, durationTicks: 1,
    requires: Object.freeze([
      req('hasAccount', 'no_account', (s) => s.hasAccount === true, '名下有账本账户'),
      req('hasItemCatalog', 'no_item_catalog', (s) => s.hasItemCatalog === true, '物品目录已建立'),
      // 可售对象是**劳动成果**（非制作原料）：木头被 craft/build 持续消耗，
      // 用木头作可售余量会让 trade 永久不可达。
      req('hasSurplus', 'no_surplus', (s) => s.hasSurplus === true, '背包里有可售产出品'),
      req('supplyPoolBalance', 'pool_insufficient', (s) => (s.supplyPoolCoversSurplus !== false), '供应池余额足以支付'),
    ]),
    mayFail: Object.freeze(['pool_insufficient', 'trade_failed']),
    contention: Object.freeze({ pool: POOLS.SUPPLY_MONEY, mode: CONTENTION.QUOTA }),
    success: 'goods_sold', failure: 'no_counterparty_funds',
  }),
  socialize: Object.freeze({
    action: 'socialize', kind: 'social', goal: 'bond',
    known: true, simulatable: false, unknownFields: Object.freeze(['bondGain', 'peerChoice']),
    completes: true, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({}),
    produces: Object.freeze({ bond: 1 }), risk: 0, durationTicks: 1,
    requires: Object.freeze([
      req('hasPeer', 'no_peer', (s) => s.hasPeer === true, '附近有其他居民'),
    ]),
    // t26（F4）：mayFail 原本是**空数组**，等于宣称"社交永远不会失败"。
    // 但执行器会原样透出 interaction.propose 的拒绝原因（同一对之间待决互动过多），
    // 契约与执行器因此漂移：居民看到的是契约保证不了的原因。
    mayFail: Object.freeze(['too_many_pending', 'socialize_rejected']),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: 'bond_formed', failure: 'too_many_pending',
  }),
  court: Object.freeze({
    action: 'court', kind: 'social', goal: 'reproduce',
    known: true, simulatable: false, unknownFields: Object.freeze(['mateChoice', 'acceptanceChance']),
    completes: true, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({}),
    produces: Object.freeze({ proposal: 1 }), risk: 0, durationTicks: 1,
    requires: Object.freeze([
      req('paired', 'already_paired', (s) => s.paired !== true, '尚未配对'),
      req('eligibleMate', 'no_eligible_mate', (s) => s.eligibleMate === true, '存在合适的未婚对象'),
    ]),
    // t26（F4）：表白同样会撞上"同一对之间待决互动过多"，契约必须承认这条路。
    mayFail: Object.freeze(['court_failed', 'too_many_pending']),
    // 配偶名额是**唯一对象**：先占者胜。
    contention: Object.freeze({ pool: POOLS.MATE, mode: CONTENTION.EXCLUSIVE }),
    success: 'proposal_sent', failure: 'no_eligible_mate',
  }),
  accept: Object.freeze({
    action: 'accept', kind: 'social', goal: 'reproduce',
    known: true, simulatable: false, unknownFields: Object.freeze(['pairFormed']),
    completes: true, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({}),
    produces: Object.freeze({ pair: 1 }), risk: 0, durationTicks: 1,
    requires: Object.freeze([
      req('paired', 'already_paired', (s) => s.paired !== true, '尚未配对'),
      // t13：待回应互动的**唯一事实来源**是 interaction 记录，不再是只服务表白的内存队列。
      req('hasPendingInteraction', 'no_pending_interaction', (s) => s.hasPendingInteraction === true, '有人向我表白/请求'),
    ]),
    mayFail: Object.freeze(['accept_failed', 'not_the_recipient']),
    contention: Object.freeze({ pool: POOLS.MATE, mode: CONTENTION.EXCLUSIVE }),
    // t26（F4）：failure 必须与 requires 的 reason **逐字一致**。
    // 这里原本写 'no_pending_proposal'、requires 写 'no_pending_court'、
    // 执行器实际返回 'no_pending_interaction' —— 同一个"没人向我提出请求"的事实
    // 在三个地方有三个名字，任何按名字分支的消费者都会漏判。
    success: 'pair_formed', failure: 'no_pending_interaction',
  }),
  // ---- t13：双向社会互动（结构化请求/承诺/履约/违约/拒绝） ----
  // 这几条让"承诺—履约—违约—信任"进入**决策空间**，而不只是被动记录：
  // 居民自己要能选择许诺、选择兑现、选择失信、选择拒绝。
  promise: Object.freeze({
    action: 'promise', kind: 'social', goal: 'bond',
    known: true, simulatable: false, unknownFields: Object.freeze(['counterpartyTrust', 'termsAcceptance']),
    completes: true, direction: 'give',
    needsDelta: Object.freeze({}), consumes: Object.freeze({}),
    // 承诺本身不消耗物资，但它建立**待履约义务**（真实代价在 fulfill 时才发生）。
    produces: Object.freeze({ obligation: 1 }), risk: 0.15, durationTicks: 1,
    requires: Object.freeze([
      req('hasPeer', 'no_peer', (s) => s.hasPeer === true, '附近有其他居民'),
    ]),
    // t26（F4）：'too_many_open' 是**不存在**的原因串（propose 返回的是
    // 'too_many_open_promises'）。契约里写一个永远不会出现的名字，等于把
    // "可能失败"这件事从文档里抹掉。
    mayFail: Object.freeze(['too_many_open_promises', 'promise_rejected']),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: 'promise_made', failure: 'too_many_open_promises',
  }),
  fulfill: Object.freeze({
    action: 'fulfill', kind: 'social', goal: 'bond',
    known: true, simulatable: false, unknownFields: Object.freeze(['trustGain']),
    completes: true, direction: 'give',
    needsDelta: Object.freeze({}), consumes: Object.freeze({ goods: 1 }),
    produces: Object.freeze({ trust: 1 }), risk: 0.05, durationTicks: 1,
    requires: Object.freeze([
      req('hasOpenPromise', 'no_open_promise', (s) => s.hasOpenPromise === true, '自己欠着别人一个承诺'),
      req('canFulfillPromise', 'cannot_deliver', (s) => s.canFulfillPromise === true, '手头的货够兑现承诺'),
    ]),
    mayFail: Object.freeze(['cannot_deliver', 'not_your_open_promise']),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: 'promise_fulfilled', failure: 'cannot_deliver',
  }),
  violate: Object.freeze({
    action: 'violate', kind: 'social', goal: 'sustain-need',
    known: true, simulatable: false, unknownFields: Object.freeze(['trustLoss', 'reputationLoss']),
    completes: true, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({}),
    // 违约是**有代价的**：产出的是"省下的那份货"，代价写在 applyConsequence 里
    //（友谊 -0.2、声誉 -6）。风险字段就是这份社会代价的可见化。
    produces: Object.freeze({ goods_saved: 1 }), risk: 0.6, durationTicks: 1,
    requires: Object.freeze([
      req('hasOpenPromise', 'no_open_promise', (s) => s.hasOpenPromise === true, '自己欠着别人一个承诺'),
    ]),
    mayFail: Object.freeze(['not_your_open_promise']),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: 'promise_violated', failure: 'no_open_promise',
  }),
  reject: Object.freeze({
    action: 'reject', kind: 'social', goal: 'sustain-need',
    known: true, simulatable: false, unknownFields: Object.freeze(['relationshipCost']),
    completes: true, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({}),
    produces: Object.freeze({}), risk: 0.1, durationTicks: 1,
    requires: Object.freeze([
      req('hasPendingInteraction', 'no_pending_interaction', (s) => s.hasPendingInteraction === true, '有人向我提出请求'),
    ]),
    mayFail: Object.freeze(['not_the_recipient', 'already_resolved']),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    // t26（F4）：同上，统一为执行器真实返回的 no_pending_interaction。
    success: 'request_rejected', failure: 'no_pending_interaction',
  }),
  found: Object.freeze({
    action: 'found', kind: 'produce', goal: 'start-business',
    known: true, simulatable: false, unknownFields: Object.freeze(['businessViability', 'industryChoice']),
    completes: true, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({ money: 60 }),
    produces: Object.freeze({ business: 1 }), risk: 0.2, durationTicks: 1,
    requires: Object.freeze([
      req('hasAccount', 'no_account', (s) => s.hasAccount === true, '名下有账本账户'),
      req('canFound', 'no_capital', (s) => s.canFound === true, '自有资本达到开办门槛'),
      // 市场空位是共享额度：没有空位时不该把 found 摆到居民面前
      // （实测 42 家企业挤在只容得下 1 家的市场里，破产 655 次）。
      req('marketRoom', 'market_full', (s) => s.marketRoom !== false, '市场尚有空位'),
    ]),
    mayFail: Object.freeze(['no_capital', 'pay_failed']),
    contention: Object.freeze({ pool: POOLS.MARKET_ROOM, mode: CONTENTION.QUOTA }),
    success: 'business_founded', failure: 'insufficient_capital_or_room',
  }),
  expedition: Object.freeze({
    action: 'expedition', kind: 'mobility', goal: 'acquire-external',
    known: true, simulatable: false, unknownFields: Object.freeze(['loot', 'injurySeverity', 'encounter']),
    completes: true, direction: null,
    needsDelta: Object.freeze({}), consumes: Object.freeze({}),
    produces: Object.freeze({ loot: 1 }), risk: 0.3, durationTicks: 6,
    requires: Object.freeze([
      req('expeditionViable', 'expedition_not_viable', (s) => s.expeditionViable === true, '当前状态允许外出'),
    ]),
    mayFail: Object.freeze(['expedition_failed']),
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: 'returned_with_loot', failure: 'not_viable',
  }),
});

/** 未建模行动的契约：显式未知（不是零成本零风险）。 */
function unknownContract(name) {
  return Object.freeze({
    action: name,
    kind: 'unknown',
    goal: 'unknown',
    known: false,
    simulatable: false,
    unknownFields: Object.freeze(['everything']),
    completes: false,
    direction: null,
    needsDelta: null,
    consumes: null,
    produces: null,
    risk: null,
    durationTicks: null,
    requires: null,
    mayFail: null,
    contention: Object.freeze({ pool: null, mode: CONTENTION.NONE }),
    success: null,
    failure: 'not_in_contract',
  });
}

/**
 * 取某行动的契约。未知行动返回 known=false 的显式未知契约
 * （**不是**零成本零风险），使预想无法把未知伪装成安全。
 * @param {unknown} action
 * @returns {object}
 */
export function contractOf(action) {
  const name = typeof action === 'string' ? action : '';
  const found = CONTRACTS[name];
  if (found !== undefined) return found;
  return unknownContract(name);
}

/** 该行动是否已被契约建模（known=true）。 */
export function isKnown(action) {
  return contractOf(action).known === true;
}

/** 该行动的收益是否可数值化预测。 */
export function isSimulatable(action) {
  return contractOf(action).simulatable === true;
}

/** 契约覆盖的全部行动名（供文档核对与测试断言覆盖度）。 */
export function knownActions() {
  return Object.keys(CONTRACTS);
}

/** 生存骨架行动（由契约推导，取代散落的硬编码清单）。 */
export function sustainActions() {
  return knownActions().filter((a) => CONTRACTS[a].kind === 'sustain');
}

/** 非生存行动（由契约推导）。 */
export function nonSustainActions() {
  return knownActions().filter((a) => CONTRACTS[a].kind !== 'sustain');
}

/** 是否为生存骨架行动。 */
export function isSustain(action) {
  const c = contractOf(action);
  return c.known === true && c.kind === 'sustain';
}

/**
 * 预想侧的需求变化预测：把契约的 needsDelta 归一化为**预测**形状。
 * 未知行动返回 null（调用方必须显式处理未知，不得填 0）。
 * @param {unknown} action
 * @returns {{ food: number, water: number }|null}
 */
export function predictedNeedsDelta(action) {
  const c = contractOf(action);
  if (c.known !== true || c.needsDelta === null) return null;
  return { food: c.needsDelta.food ?? 0, water: c.needsDelta.water ?? 0 };
}

/** 契约声明的风险估计；未知行动返回 null（不是 0）。 */
export function predictedRisk(action) {
  const c = contractOf(action);
  return c.known === true ? c.risk : null;
}

/** 该行动是否当 tick 完成（false = 只是发起/计划）。 */
export function completesThisTick(action) {
  const c = contractOf(action);
  return c.known === true && c.completes === true;
}

/**
 * 前置条件判定：**与执行器同一套判据**。
 * 候选生成与日程建议都必须先过这一关，否则会出现「候选出现但执行必然被拒」的空转
 * （t11 实测：write 88% 的选择以 already_writing 失败）。
 *
 * @param {unknown} action
 * @param {object} state 由主循环组装的居民状态视图
 * @returns {{ ok: boolean, reason: string|null, unmet: string[] }}
 */
/** 无故障时复用的空数组（faults 是热路径字段，不为"没事"反复分配）。 */
const NO_FAULTS = Object.freeze([]);

/** 安全取出 requires 条目的 key（条目本身可能已损坏）。 */
function requireKeyOf(r) {
  return (r !== null && typeof r === 'object' && typeof r.key === 'string' && r.key !== '')
    ? r.key : 'unknown';
}

/**
 * 判定某行动在给定状态下是否可执行（与执行器同一套判据）。
 *
 * 返回的 `faults` 把**契约本身坏了**与**前置条件不满足**分开：
 *   - ok:false + faults 为空   → 合法的条件不满足（正常过滤，调用方按 reason 解释）
 *   - ok:false + faults 非空   → **契约故障**（程序缺陷），必须上报 observer 告警
 *
 * 旧实现把两者混为一谈：`catch { passed = false }` 让"测试函数抛错"伪装成
 * "条件没满足"，契约坏了会表现为"这个行动现在不可用"，理由还是一句听起来
 * 很合理的话。t19 的归因表明，这正是全部动态行动被静默清空的机制。
 *
 * 故障时仍返回 ok:false（**保守**）：宁可不去执行一个无法校验的行动，
 * 也不要因为契约坏了就把它放行——可见性由 faults + observer 告警提供，
 * 而不是靠在决策层替契约猜一个结果。
 *
 * @param {unknown} action
 * @param {object} state
 * @returns {{ ok: boolean, reason: string|null, unmet: string[], faults: Array<{key: string, action: string, message: string}> }}
 */
export function preconditionOf(action, state = {}) {
  const c = contractOf(action);
  if (c.known !== true) {
    // 未建模行动无法判定前置条件——显式未知，不得默认为可行。
    // 这是**合法**拒绝（该行动本就不在契约里），不是契约故障，故 faults 为空。
    return { ok: false, reason: 'not_in_contract', unmet: ['unknown_action'], faults: NO_FAULTS };
  }
  if (!Array.isArray(c.requires)) {
    // 契约结构损坏：程序缺陷，不是"条件不满足"，不得静默当作普通拒绝。
    return {
      ok: false,
      reason: 'contract_malformed',
      unmet: ['contract_malformed'],
      faults: [{ key: 'requires_malformed', action: c.action, message: '契约的 requires 不是数组' }],
    };
  }
  const unmet = [];
  const faults = [];
  let reason = null;
  for (const r of c.requires) {
    if (r === null || typeof r !== 'object' || typeof r.test !== 'function') {
      // 条目本身损坏：同样是契约故障，此前会被静默算作"条件不满足"。
      const key = requireKeyOf(r);
      faults.push({ key, action: c.action, message: 'requires 条目缺少可调用的 test' });
      unmet.push(key);
      if (reason === null) reason = 'contract_malformed';
      continue;
    }
    let passed;
    try {
      passed = r.test(state) === true;
    } catch (err) {
      // **关键**：测试函数抛错 ≠ 前置条件不满足。
      faults.push({
        key: requireKeyOf(r),
        action: c.action,
        message: err instanceof Error ? err.message : String(err),
      });
      passed = false;
    }
    if (!passed) {
      unmet.push(r.key);
      if (reason === null) reason = r.reason;
    }
  }
  return {
    ok: unmet.length === 0,
    reason,
    unmet,
    faults: faults.length === 0 ? NO_FAULTS : faults,
  };
}

/** 该行动的争用声明（未知行动返回 none，且调用方应结合 known 判断）。 */
export function contentionOf(action) {
  return contractOf(action).contention;
}
