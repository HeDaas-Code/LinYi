/**
 * truman-town.economy.tax — 税收与再分配 / Taxation
 *
 * 按规则对余额（base=balance）或交易额（base=transaction）征税，转入税收池
 * 账户（tax:pool），再按人头（per_capita）或公共支出（public）再分配。
 * 征税与再分配均经 economy.ledger.transaction 真实转账，税收总额与再分配总额
 * 严格守恒（pool 余额再分配后归零），不凭空造钱。
 *
 * RPC：economy.tax.collect / redistribute
 */

import * as ledger from './ledger/index.js';
import * as store from './_store.js';
import * as pubsub from '../infra/events/pubsub.js';

const POOL_OWNER = 'tax:pool';
const TREASURY_OWNER = 'bank:treasury';

/** 税收池账户 id（open 后写入；__reset 清空）。 */
let poolAccountId = null;

function validNum(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** 打开税收池账户（余额 0）。 */
export function open(input = {}) {
  const acct = ledger.account.open({ ownerId: POOL_OWNER, balance: 0 });
  poolAccountId = acct.accountId;
  return { poolAccountId, ownerId: POOL_OWNER };
}

/** 税收池当前余额。 */
export function poolBalance() {
  if (poolAccountId === null) return 0;
  return ledger.account.balance(poolAccountId) ?? 0;
}

/** 排除税收池与银行金库的默认征税/再分配对象账户。 */
function defaultTargetAccounts() {
  return store.listAccounts()
    .filter((n) => !n.data.closed && n.data.ownerId !== POOL_OWNER && n.data.ownerId !== TREASURY_OWNER)
    .map((n) => n.id);
}

/**
 * 征税：对目标账户按税率计征并转入税收池。
 * @param {{ rate: number, base?: 'balance'|'transaction', volumes?: Record<string, number>, accountIds?: string[], tick?: number }} input
 * @returns {{ collected: number, base: string, perAccount: Array<{ accountId: string, tax: number }> }}
 */
export function collect(input = {}) {
  if (poolAccountId === null) throw new Error('tax_pool_not_open');
  const rate = validNum(input?.rate, 0);
  const base = input?.base === 'transaction' ? 'transaction' : 'balance';
  const volumes = (input?.volumes && typeof input.volumes === 'object') ? input.volumes : {};
  const targets = Array.isArray(input?.accountIds) ? input.accountIds : defaultTargetAccounts();

  const perAccount = [];
  let collected = 0;
  for (const accountId of targets) {
    const balance = ledger.account.balance(accountId) ?? 0;
    const taxable = base === 'transaction' ? (validNum(volumes[accountId], 0)) : balance;
    const tax = taxable * rate;
    if (tax <= 0) continue;
    ledger.transaction.recorder.post({ from: accountId, to: poolAccountId, amount: tax, ref: 'tax_collect', memo: '征税' });
    collected += tax;
    perAccount.push({ accountId, tax });
  }
  pubsub.publish('economy.tax.collected', { collected, base, perAccount });
  return { collected, base, perAccount };
}

/**
 * 再分配：把税收池余额按人头均分给 recipients（缺省为全体非池/非金库账户）
 * 或一次性拨付给公共账户（mode=public）。
 * @param {{ mode?: 'per_capita'|'public', recipients?: string[], publicAccountId?: string, tick?: number }} input
 * @returns {{ redistributed: number, mode: string, perRecipient: Array<{ accountId: string, amount: number }> }}
 */
export function redistribute(input = {}) {
  if (poolAccountId === null) throw new Error('tax_pool_not_open');
  const mode = input?.mode === 'public' ? 'public' : 'per_capita';
  const pool = poolBalance();
  if (pool <= 0) return { redistributed: 0, mode, perRecipient: [] };

  const perRecipient = [];
  let redistributed = 0;

  if (mode === 'public') {
    const target = input?.publicAccountId;
    if (typeof target !== 'string' || target === '') throw new TypeError('tax.redistribute: public 模式需要 publicAccountId');
    ledger.transaction.recorder.post({ from: poolAccountId, to: target, amount: pool, ref: 'tax_redistribute', memo: '公共支出' });
    redistributed = pool;
    perRecipient.push({ accountId: target, amount: pool });
  } else {
    const rlist = (Array.isArray(input?.recipients) && input.recipients.length > 0) ? input.recipients : defaultTargetAccounts();
    if (rlist.length === 0) return { redistributed: 0, mode, perRecipient: [] };
    const share = Math.floor(pool / rlist.length);
    for (let i = 0; i < rlist.length; i += 1) {
      const amount = i === rlist.length - 1 ? (pool - share * (rlist.length - 1)) : share;
      if (amount <= 0) continue;
      ledger.transaction.recorder.post({ from: poolAccountId, to: rlist[i], amount, ref: 'tax_redistribute', memo: '按人头补贴' });
      redistributed += amount;
      perRecipient.push({ accountId: rlist[i], amount });
    }
  }

  pubsub.publish('economy.tax.redistributed', { redistributed, mode, perRecipient });
  return { redistributed, mode, perRecipient };
}

/** 复位税收池状态（图节点由 economy.__reset 的 graph.__reset 清空）。 */
export function __reset() {
  poolAccountId = null;
}
