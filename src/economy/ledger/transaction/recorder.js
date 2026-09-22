/**
 * truman-town.economy.ledger.transaction.recorder — 流水记录器 / Transaction Recorder
 *
 * 校验并落账：post 先经 validator.check 校验，再原子扣减/入账双方余额，
 * 写入流水节点（type=economy.tx，全局有序 id + seq + ts），并发布
 * economy.transaction 事件；receipt 按 txId 取回流水。
 *
 * RPC：economy.ledger.transaction.recorder.post / receipt
 */

import * as validator from './validator.js';
import * as pubsub from '../../../infra/events/pubsub.js';
import * as identity from '../../../infra/identity.js';
import * as store from '../../_store.js';

let seq = 0;

function invalidError(check) {
  const err = new Error('transaction_invalid: ' + check.reason);
  err.code = 'TRANSACTION_INVALID';
  err.reason = check.reason;
  err.details = check;
  return err;
}

/**
 * 记录一笔转账（校验 → 双方余额增减 → 写流水 → 发事件），返回回执。
 * @param {{ from: string, to: string, amount: number, ref?: string, memo?: string }} input
 * @returns {object} 流水回执
 * @throws {Error} 校验失败（code=TRANSACTION_INVALID）
 */
export function post(input = {}) {
  const check = validator.check(input);
  if (!check.valid) throw invalidError(check);

  const txId = identity.next('tx');
  seq += 1;
  const ts = Date.now();

  const fromBalanceAfter = store.applyBalance(input.from, -input.amount);
  let toBalanceAfter;
  try {
    toBalanceAfter = store.applyBalance(input.to, input.amount);
  } catch (err) {
    // 防御性回滚：正常流程经 validator.check 后不会走到这里
    store.applyBalance(input.from, input.amount);
    throw err;
  }

  const record = {
    txId,
    seq,
    ts,
    from: input.from,
    to: input.to,
    amount: input.amount,
    fromBalanceAfter,
    toBalanceAfter,
    ref: input.ref ?? null,
    memo: input.memo ?? null,
  };
  store.writeTx(txId, record);
  pubsub.publish('economy.transaction', record);
  return record;
}

/**
 * 按 txId 取回流水回执。
 * @param {string} txId
 * @returns {object|null}
 */
export function receipt(txId) {
  const node = store.readTx(txId);
  return node === null ? null : node.data;
}

/** 复位流水序号（测试用）。 */
export function __reset() {
  seq = 0;
}
