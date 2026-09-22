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
