/**
 * truman-town.civilization.collapse.confirmer — 崩溃确认器 / Collapse Confirmer
 *
 * 确认集体性崩溃并写入观察者事件日志；override() 支持人工强制确认。
 */

import * as detector from './detector.js';
import * as observer from '../../observer/index.js';

/**
 * 运行检测器，若确认崩溃则写 observer 事件日志。
 * @param {object} input 透传给 detector.detect；可带 { tick } 指定日志 tick
 * @returns {object} { confirmed, detector, log? }
 */
export function confirm(input = {}) {
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const det = detector.detect(input);
  if (!det.collapsed) {
    return { confirmed: false, detector: det };
  }
  const log = observer.recorder.eventLog.record({
    tick,
    topic: 'civilization.collapse',
    payload: { score: det.score, threshold: det.threshold, reasons: det.reasons },
  });
  return { confirmed: true, detector: det, log };
}

/**
 * 人工强制确认一次崩溃（跳过检测器），并写 observer 事件日志。
 * @param {object} [input]
 * @param {number} [input.tick=0]
 * @param {string} [input.reason] 覆盖原因
 * @returns {object} { confirmed, overridden, reason, log }
 */
export function override(input = {}) {
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const reason = typeof input?.reason === 'string' && input.reason.trim() !== '' ? input.reason : 'manual_override';
  const log = observer.recorder.eventLog.record({
    tick,
    topic: 'civilization.collapse',
    payload: { overridden: true, reason },
  });
  return { confirmed: true, overridden: true, reason, log };
}
