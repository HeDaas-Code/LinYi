/**
 * truman-town.observer.experiment.compare — 跨文明对比 / Civilization Compare
 *
 * 比较历代文明的存活时长、崩溃方式与遗产。civilizations 从 graph store 读取
 * 文明存档（type=civilization.archive，由文明模块写入）并按存活时长降序返回；
 * metrics 对任意存档记录数组做纯聚合统计。两者均只读，绝不修改世界状态。
 */

import * as graph from '../../infra/store/graph.js';

const ARCHIVE_TYPE = 'civilization.archive';

function normalize(record) {
  if (record === null || typeof record !== 'object') return null;
  return {
    civilizationId: typeof record.civilizationId === 'string' ? record.civilizationId : 'unknown',
    survivedTicks: typeof record.survivedTicks === 'number' && record.survivedTicks >= 0 ? record.survivedTicks : 0,
    collapseMode: typeof record.collapseMode === 'string' ? record.collapseMode : 'none',
    legacy: typeof record.legacy === 'string' ? record.legacy : '',
  };
}

/**
 * 读取全部文明存档并按存活时长降序返回（跨文明对比）。
 * @returns {Array<{ civilizationId: string, survivedTicks: number, collapseMode: string, legacy: string }>}
 */
export function civilizations() {
  const records = graph.read({ type: ARCHIVE_TYPE })
    .map((n) => normalize(n.data))
    .filter((r) => r !== null);
  records.sort((a, b) =>
    b.survivedTicks - a.survivedTicks ||
    (a.civilizationId < b.civilizationId ? -1 : a.civilizationId > b.civilizationId ? 1 : 0));
  return records;
}

/**
 * 对存档记录数组做纯聚合统计（存活时长、崩溃方式、遗产）。
 * @param {Array} records 存档记录（可为 civilizations() 的结果或任意数组）
 * @returns {{ count: number, avgSurvival: number, maxSurvival: number, collapseModes: object, withLegacy: number }}
 */
export function metrics(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('compare.metrics: records 必须为数组');
  }
  const list = records.map(normalize).filter((r) => r !== null);
  const survival = list.map((r) => r.survivedTicks);
  const collapseModes = {};
  for (const r of list) {
    collapseModes[r.collapseMode] = (collapseModes[r.collapseMode] ?? 0) + 1;
  }
  const sum = survival.reduce((a, b) => a + b, 0);
  return {
    count: list.length,
    avgSurvival: list.length > 0 ? sum / list.length : 0,
    maxSurvival: list.length > 0 ? Math.max(...survival) : 0,
    collapseModes,
    withLegacy: list.filter((r) => r.legacy !== '').length,
  };
}
