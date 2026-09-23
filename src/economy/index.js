/**
 * truman-town.economy — 经济系统统一出口。
 *
 * 汇总账本（ledger）与市场（market）两大子系统，并提供 __reset 复位
 * 经济状态（图存储/ID 计数/事件总线/破产钩子/价格表）。
 */

export * as ledger from './ledger/index.js';
export * as market from './market/index.js';
export * as industry from './industry/index.js';
export * as bankruptcy from './bankruptcy.js';
export * as bank from './bank/index.js';
export * as tax from './tax.js';

import * as graph from '../infra/store/graph.js';
import * as identity from '../infra/identity.js';
import * as pubsub from '../infra/events/pubsub.js';
import { __reset as resetValidator } from './ledger/transaction/validator.js';
import { __reset as resetRecorder } from './ledger/transaction/recorder.js';
import { __reset as resetPrice } from './market/price.js';
import { __reset as resetCredit } from './bank/credit.js';
import { __reset as resetInterest } from './bank/interest.js';
import { __reset as resetTax } from './tax.js';

/** 复位经济状态（测试用）。 */
export function __reset() {
  graph.__reset();
  identity.__reset();
  pubsub.__reset();
  resetValidator();
  resetRecorder();
  resetPrice();
  resetCredit();
  resetInterest();
  resetTax();
}
