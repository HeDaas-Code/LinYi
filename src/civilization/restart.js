/**
 * truman-town.civilization.restart — 文明重启 / Civilization Restart
 *
 * 文明崩溃后执行沙盒重启：归档上一代遗产（图谱 + 200-500 字描述），
 * 并把遗产注入下一代文明；inherit() 供单独继承使用。
 */

import * as graphStore from '../infra/store/graph.js';
import * as identity from '../infra/identity.js';
import * as observer from '../observer/index.js';
import * as legacyGraph from './legacy/graph.js';
import * as extractor from './legacy/summary/extractor.js';
import * as writer from './legacy/summary/writer.js';

/** 文明遗产继承记录在 graph store 中的节点类型。 */
export const HERITAGE_TYPE = 'civilization.heritage';

/**
 * 把上一代遗产注入下一代文明（持久化继承记录 + 写 observer 日志）。
 * @param {object} [input]
 * @param {string} [input.civilizationId] 下一代文明 ID（缺省用 identity 生成）
 * @param {object} [input.legacy] 遗产对象（图谱/描述/事实）
 * @param {number} [input.tick=0]
 * @returns {object} { civilizationId, inherited, heritageId, legacy }
 */
export function inherit(input = {}) {
  const civilizationId =
    typeof input?.civilizationId === 'string' && input.civilizationId.trim() !== ''
      ? input.civilizationId
      : identity.next('civ');
  const legacy = input?.legacy ?? {};
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const heritageId = identity.next('heritage');

  graphStore.write({
    id: heritageId,
    type: HERITAGE_TYPE,
    data: { civilizationId, legacy, inheritedAt: Date.now(), tick },
  });
  observer.recorder.eventLog.record({
    tick,
    topic: 'civilization.heritage.inherited',
    payload: { civilizationId, graphId: legacy?.graph?.graphId ?? null },
  });
  return { civilizationId, inherited: true, heritageId, legacy };
}

/**
 * 执行沙盒重启：归档遗产 → 重置沙盘 → 注入下一代文明。
 * @param {object} [input]
 * @param {number} [input.tick=0]
 * @param {Function} [input.reset] 沙盘重置回调（重启时调用）
 * @param {string} [input.civilizationId] 上一代文明 ID
 * @param {string} [input.nextCivilizationId] 下一代文明 ID
 * @param {Array} [input.entries] 编年志条目（缺省从 chronicle 读取）
 * @param {string} [input.model] 遗产描述 LLM 模型
 * @returns {Promise<object>} { civilizationId, inherited, heritageId, legacy, restartedAt, previousCivilizationId }
 */
export async function execute(input = {}) {
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const reset = typeof input?.reset === 'function' ? input.reset : null;

  // 1) 归档上一代遗产（图谱 + 描述）
  const graph = input?.graph ?? legacyGraph.build({ civilizationId: input?.civilizationId, entries: input?.entries });
  const facts = extractor.extract({ graph });
  const summary = input?.summary ?? (await writer.generate({ extract: facts, model: input?.model }));
  const legacy = { graph, facts, summary };

  // 2) 重启沙盘
  if (reset) reset();

  // 3) 注入下一代文明
  const result = inherit({ civilizationId: input?.nextCivilizationId, legacy, tick });

  observer.recorder.eventLog.record({
    tick,
    topic: 'civilization.restart',
    payload: { previousCivilizationId: graph.civilizationId, nextCivilizationId: result.civilizationId },
  });

  return { ...result, restartedAt: tick, previousCivilizationId: graph.civilizationId };
}

/**
 * 查询某文明的遗产继承记录。
 * @param {string} [civilizationId] 缺省返回全部
 * @returns {Array<object>}
 */
export function heritage(civilizationId) {
  const all = graphStore.read({ type: HERITAGE_TYPE });
  if (civilizationId === undefined) return all.map((n) => n.data);
  return all.filter((n) => n.data?.civilizationId === civilizationId).map((n) => n.data);
}
