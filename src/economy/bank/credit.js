/**
 * truman-town.economy.bank.credit — 信贷 / Credit
 *
 * 申请与偿还贷款，记录额度、期限与状态。贷款以 graph store 持久化
 * （type=economy.loan），发放与还款均经 economy.ledger.transaction 真实转账：
 * 银行金库（bank:treasury）→ 借款人（发放）、借款人 → 银行金库（还款），
 * 绝不凭空造钱（金库资本在 seed 阶段作为初始货币供应注入）。
 *
 * RPC：economy.bank.credit.apply / repay
 */

import * as identity from '../../infra/identity.js';
import * as ledger from '../ledger/index.js';
import * as store from '../_store.js';
import * as pubsub from '../../infra/events/pubsub.js';

const TREASURY_OWNER = 'bank:treasury';

/** 银行金库账户 id（open 后写入；__reset 清空）。 */
let treasuryAccountId = null;

function assertId(id, what) {
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError('credit: ' + what + ' 必须为非空字符串');
  return id;
}

function validNum(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** 解析借款人账户：business 用其账户，agent 按 ownerId 反查账户。 */
function resolveBorrowerAccount(borrowerId, borrowerType) {
  if (borrowerType === 'business') {
    const biz = store.readBusiness(borrowerId);
    if (biz === null || biz.type !== store.TYPES.business) throw new Error('business_not_found: ' + borrowerId);
    return biz.data.accountId;
  }
  const found = store.listAccounts().find((n) => n.data.ownerId === borrowerId && !n.data.closed);
  if (found === undefined) throw new Error('agent_account_not_found: ' + borrowerId);
  return found.id;
}

/**
 * 开设银行金库账户（seed 阶段注入初始资本，属于初始货币供应，非凭空造钱）。
 * @param {{ capital?: number }} input
 * @returns {{ treasuryAccountId: string, capital: number, ownerId: string }}
 */
export function open(input = {}) {
  const capital = validNum(input?.capital, 0);
  const acct = ledger.account.open({ ownerId: TREASURY_OWNER, balance: capital });
  treasuryAccountId = acct.accountId;
  return { treasuryAccountId, capital, ownerId: TREASURY_OWNER };
}

/** 当前金库账户 id（未开则 null）。 */
export function treasury() {
  return treasuryAccountId;
}

/**
 * 申请贷款：银行金库 → 借款人账户转账，记录额度/期限/状态。
 * @param {{ borrowerId: string, borrowerType?: 'agent'|'business', principal: number, rate?: number, term?: number, tick?: number }} input
 * @returns {object} 贷款快照
 */
export function apply(input = {}) {
  const borrowerId = assertId(input?.borrowerId, 'borrowerId');
  const borrowerType = input?.borrowerType === 'business' ? 'business' : 'agent';
  const principal = validNum(input?.principal, 0);
  if (principal <= 0) throw new TypeError('credit.apply: principal 必须 > 0');
  const rate = validNum(input?.rate, 0);
  const term = validNum(input?.term, 0); // 0 = 无固定期限
  if (treasuryAccountId === null) throw new Error('bank_treasury_not_open');

  const borrowerAccountId = resolveBorrowerAccount(borrowerId, borrowerType);
  ledger.transaction.recorder.post({
    from: treasuryAccountId, to: borrowerAccountId, amount: principal, ref: 'credit_issue', memo: '贷款发放',
  });

  const loanId = identity.next('loan');
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const loan = {
    loanId,
    borrowerId,
    borrowerType,
    borrowerAccountId,
    lenderAccountId: treasuryAccountId,
    principal,
    outstanding: principal,
    accruedInterest: 0,
    repaid: 0,
    rate,
    term,
    issuedTick: tick,
    dueTick: term > 0 ? tick + term : null,
    status: 'active',
    overdue: false,
    repayments: [],
  };
  store.writeLoan(loanId, loan);
  pubsub.publish('economy.bank.credit.issued', { loanId, borrowerId, borrowerType, principal, rate, term });
  return loan;
}

/**
 * 还款：借款人账户 → 银行金库转账，按未偿余额冲减（先本金后利息）。
 * @param {{ loanId: string, amount: number, tick?: number }} input
 * @returns {{ loanId: string, paid: number, outstanding: number, status: string }}
 */
export function repay(input = {}) {
  const loanId = assertId(input?.loanId, 'loanId');
  const loan = get(loanId);
  if (loan === null) throw new Error('loan_not_found: ' + loanId);
  if (loan.status !== 'active') throw new Error('loan_inactive: ' + loanId);
  const amount = validNum(input?.amount, 0);
  if (amount <= 0) throw new TypeError('credit.repay: amount 必须 > 0');

  const pay = Math.min(amount, loan.outstanding);
  ledger.transaction.recorder.post({
    from: loan.borrowerAccountId, to: loan.lenderAccountId, amount: pay, ref: 'credit_repay', memo: '贷款还款',
  });

  loan.outstanding -= pay;
  loan.repaid += pay;
  loan.repayments.push({ at: Date.now(), tick: input?.tick ?? null, amount: pay });
  if (loan.outstanding <= 1e-9) {
    loan.outstanding = 0;
    loan.status = 'repaid';
    loan.closedAt = Date.now();
  }
  store.writeLoan(loanId, loan);
  pubsub.publish('economy.bank.credit.repaid', { loanId, amount: pay, outstanding: loan.outstanding, status: loan.status });
  return { loanId, paid: pay, outstanding: loan.outstanding, status: loan.status };
}

/** 按 loanId 取贷款快照（不存在返回 null）。 */
export function get(loanId) {
  const node = store.readLoan(loanId);
  return (node !== null && node.type === store.TYPES.loan) ? node.data : null;
}

/** 列出全部贷款。 */
export function list() {
  return store.listLoans().map((n) => n.data);
}

/** 列出某借款人的在途（active）贷款。 */
export function listByBorrower(borrowerId) {
  return store.listLoans()
    .filter((n) => n.data.borrowerId === borrowerId && n.data.status === 'active')
    .map((n) => n.data);
}

/** 某借款人未偿余额合计。 */
export function outstandingFor(borrowerId) {
  return listByBorrower(borrowerId).reduce((s, l) => s + l.outstanding, 0);
}

/** 标记贷款违约（无法足额清偿时）。 */
export function markDefault(input = {}) {
  const loanId = assertId(input?.loanId, 'loanId');
  const loan = get(loanId);
  if (loan === null) throw new Error('loan_not_found: ' + loanId);
  if (loan.status !== 'active') return loan;
  loan.status = 'defaulted';
  loan.defaultedAt = Date.now();
  store.writeLoan(loanId, loan);
  pubsub.publish('economy.bank.credit.defaulted', { loanId, outstanding: loan.outstanding });
  return loan;
}

/** 复位金库状态（图节点由 economy.__reset 的 graph.__reset 清空）。 */
export function __reset() {
  treasuryAccountId = null;
}
