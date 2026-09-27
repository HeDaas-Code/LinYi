/**
 * truman-town.economy.market.price — 价格发现 / Price Discovery
 *
 * 报价（quote）与依据成交更新价格（update）。MVP 为进程内价格表，
 * 由 orderbook 撮合结算后回写最新成交价。
 *
 * RPC：economy.market.price.quote / update
 */

/** @type {Map<string, number>} */
const prices = new Map();

/**
 * 报价。尚未发现价格返回 null。
 * @param {{ symbol: string }} input
 * @returns {number|null}
 */
export function quote(input = {}) {
  const symbol = input?.symbol;
  if (typeof symbol !== 'string' || symbol === '') {
    throw new TypeError('price.quote: symbol 必须为非空字符串');
  }
  return prices.has(symbol) ? prices.get(symbol) : null;
}

/**
 * 更新（发现）价格。
 * @param {{ symbol: string, price: number }} input
 * @returns {{ symbol: string, price: number }}
 */
export function update(input = {}) {
  const symbol = input?.symbol;
  const value = input?.price;
  if (typeof symbol !== 'string' || symbol === '') {
    throw new TypeError('price.update: symbol 必须为非空字符串');
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError('price.update: price 必须为非负数');
  }
  prices.set(symbol, value);
  return { symbol, price: value };
}

/** 清空价格表（测试用）。 */
export function __reset() {
  prices.clear();
}

// ---- 持久化：已发现价格必须进存档 ----

/**
 * 导出价格表。
 *
 * 价格由撮合结果**逐步发现**（update 回写成交价），是市场状态而非配置。
 * 不入档则恢复后全部 symbol 无价（quote 返回 null），供需与破产判定
 * 会在续跑开头重新「从零发现」，与连续运行不同。
 */
export function __snapshot() {
  return { prices: [...prices.entries()] };
}

/**
 * 恢复价格表（整体替换）。
 * @param {{prices?: Array<[string, number]>}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('price.__restore: 状态必须为对象');
  }
  prices.clear();
  const list = Array.isArray(data.prices) ? data.prices : [];
  for (const pair of list) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [symbol, value] = pair;
    if (typeof symbol === 'string' && symbol !== '' && Number.isFinite(value)) prices.set(symbol, value);
  }
  return { prices: prices.size };
}
