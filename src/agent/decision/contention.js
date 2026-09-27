/**
 * truman-town.agent.decision.contention — 共享池争用账本 / Contention Ledger
 *
 * 解决 t11 实测的**批量决策顺序偏置**与**共享资源重复预支**。
 *
 * 问题（实测证据）：
 * 主循环先为**全体居民**决策（decide 阶段），再按同一顺序执行（dispatch 阶段）。
 * 决策时所有居民都看到**同一份 tick 起始池况**，于是 N 个居民可以同时决定
 * 「去采集」，而执行时采集池按顺序被取空——后到者空手而归。
 * 40 人 × 60 tick 实测：同一 tick 内 forage 结果在 dispatch 顺序上严格呈
 * 「前缀成功、后缀失败」（t2：前 25 人 applied、后 6 人 noop；t5：前 13 applied、
 * 后 14 noop），608 次采集中 198 次（33%）以 forage_pool_empty 空转。
 * 这不是随机波动，而是**顺序决定胜负**的系统性偏置：注册顺序靠前的居民
 * 永远优先获得公共资源。
 *
 * 修复方式：
 * 在决策阶段引入**预留账本**——按决策顺序（与 dispatch 顺序一致）逐个扣减共享池，
 * 使第 i 个居民预想时看到的是「前 i-1 人取走之后」的真实剩余量。
 * 于是：
 *   - 预想与执行可对账（第 i 人预想的可得量 === 执行时实际可得量）；
 *   - 注定落空的行动（池已空）在预想里就得到负效用，居民不再空转；
 *   - 顺序偏置**依然存在**（先到先得是池的物理属性），但它从「意外」变成
 *     「已知且被记账」——审计可以直接读出每个 tick 谁取走了多少。
 *
 * 注意：本账本**只影响预想，不改变真实执行**。真实取用仍由执行器对真实池操作，
 * 因此账本与真实状态若不一致（例如执行器因别的原因没取），不会造成资源凭空增减。
 * 它是一份**预测视图**，不是第二份真相。
 */

/** @type {Map<string, {capacity:number, reserved:number}>} */
const pools = new Map();
let currentTick = null;
let opened = false;

function assertPool(pool) {
  if (typeof pool !== 'string' || pool === '') {
    throw new TypeError('contention: pool 必须为非空字符串');
  }
}

/**
 * 开一个新 tick 的账本（覆盖旧的）。容量取 tick 起始的真实池况。
 * @param {number} tick
 * @param {Record<string, number>} capacities 池名 → 容量
 */
export function open(tick, capacities = {}) {
  pools.clear();
  for (const [pool, capacity] of Object.entries(capacities)) {
    const c = (typeof capacity === 'number' && Number.isFinite(capacity)) ? Math.max(0, capacity) : 0;
    pools.set(pool, { capacity: c, reserved: 0 });
  }
  currentTick = Number.isInteger(tick) ? tick : null;
  opened = true;
}

/** 账本是否已为本 tick 开启。 */
export function isOpen() {
  return opened;
}

/** 当前 tick（未开启时为 null）。 */
export function tickOf() {
  return currentTick;
}

/** 某池剩余可预支量；池未登记时返回 undefined（表示**未知**，不是 0）。 */
export function remaining(pool) {
  const p = pools.get(pool);
  if (p === undefined) return undefined;
  return Math.max(0, p.capacity - p.reserved);
}

/**
 * 预支某池的额度。
 * @param {string} pool
 * @param {number} amount
 * @returns {number} 实际获批的量（0 表示池已空）
 */
export function reserve(pool, amount) {
  assertPool(pool);
  const p = pools.get(pool);
  if (p === undefined) return 0;
  const want = (typeof amount === 'number' && Number.isFinite(amount)) ? Math.max(0, amount) : 0;
  const left = Math.max(0, p.capacity - p.reserved);
  const granted = Math.min(want, left);
  p.reserved += granted;
  return granted;
}

/**
 * 供预想消费的只读视图：池名 → 剩余量。
 * 未登记的池**不出现在视图里**，调用方据此判定「未知」而不是「零」。
 * @returns {Record<string, number>}
 */
export function view() {
  const out = {};
  for (const [pool, p] of pools) out[pool] = Math.max(0, p.capacity - p.reserved);
  return out;
}

/** 审计快照：容量 / 已预支 / 剩余。 */
export function snapshot() {
  const out = {};
  for (const [pool, p] of pools) {
    out[pool] = { capacity: p.capacity, reserved: p.reserved, remaining: Math.max(0, p.capacity - p.reserved) };
  }
  return out;
}

/**
 * 采集账本状态（t23）。
 *
 * ## 为什么这份状态与 goals/outcomeModel 不同类
 * 本账本是**每 tick 派生**的：主循环在 decide 阶段开始处调用 open(tick, capacities)，
 * 而 capacities 完全来自**当时的真实世界状态**（foragePool、食物/水库存、stage2 供应池余额），
 * 每个 tick 整表重建一次（pools.clear()）。因此它不携带跨 tick 的历史，
 * 也不参与"下个 tick 的输入"——居民看到的是本 tick 重新算出的池况。
 *
 * 实测验证（不是推测）：
 *   1. 在存档前投毒（open(999,{poisonPool:5}) 并把额度全部预支），
 *      恢复后毒池确实还在；但 resume() 推进任意一个 tick 后，
 *      毒池被 open() 整表覆盖 → remaining('poisonPool') === undefined。
 *      也就是说陈旧账本在**任何决策读到它之前**就被重建了。
 *   2. 连续运行 vs 跨进程恢复的完整摘要（tick/rng/agents/needs/nodes/world，
 *      按 test/persistence.test.js 的口径剥离墙钟字段）在**不接入本 section** 时已经逐字节一致。
 *
 * ## 那为什么仍然入档
 * 因为"派生"是**当前实现的属性，不是接口承诺**：
 *   - open() 的入参由 contentionCapacities() 计算，一旦将来某个池的容量改为
 *     跨 tick 累积（例如按 tick 结算的配额），本账本就立刻变成不可派生的历史状态；
 *   - 存档目前是在**提交边界**采集的，此时账本可能停在"本 tick 已部分预支"的中间态
 *     （实测存档点 open=true、foragePool 已全额预支）。此刻若有人从存档直接读审计视图，
 *     不恢复就会看到一份空的账本——与存档时点的世界不符。
 * 入档把这种"此刻恰好一致"变成"契约上一致"，代价是每 tick 几十字节。
 * 换句话说：**入档不是因为现在就分叉，而是为了不让正确性依赖"open 恰好先跑"这个时序巧合**。
 *
 * @returns {{tick:number|null, opened:boolean, pools:Array}}
 */
export function __snapshot() {
  return {
    tick: currentTick,
    opened,
    pools: [...pools.entries()].map(([pool, p]) => ({ pool, capacity: p.capacity, reserved: p.reserved })),
  };
}

/**
 * 恢复账本状态（整体替换）。
 *
 * 与 goals.__restore 同口径：整体替换而非合并——合并会把恢复前的残留池留在表里，
 * 使结果取决于"此前跑过什么"。残缺记录丢弃而不是让预想读到 undefined/NaN。
 * @param {object} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('contention.__restore: 状态必须为对象');
  }
  pools.clear();
  for (const rec of (Array.isArray(data.pools) ? data.pools : [])) {
    if (rec === null || typeof rec !== 'object') continue;
    const pool = rec.pool;
    if (typeof pool !== 'string' || pool === '') continue;
    const capacity = (typeof rec.capacity === 'number' && Number.isFinite(rec.capacity)) ? Math.max(0, rec.capacity) : 0;
    // 预支量夹到 [0, capacity]：越界的 reserved 会让 remaining 算出负数，
    // 预想据此判"池已空"——静默改变决策，比直接丢弃更难查。
    const rawReserved = (typeof rec.reserved === 'number' && Number.isFinite(rec.reserved)) ? rec.reserved : 0;
    pools.set(pool, { capacity, reserved: Math.min(Math.max(0, rawReserved), capacity) });
  }
  currentTick = Number.isInteger(data.tick) ? data.tick : null;
  opened = data.opened === true;
  return { pools: pools.size, tick: currentTick, opened };
}

/** 复位（跨 run 不残留）。 */
export function __reset() {
  pools.clear();
  currentTick = null;
  opened = false;
}
