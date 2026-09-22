/**
 * truman-town.survival.needs.pressure.ranker — 压力排序器 / Pressure Ranker
 *
 * 按压力评分排序并给出高危名单。消费 scorer.score 的产出（模块间 call 依赖）：
 * rank 按 score 降序稳定排序，top 取前 N 名并按 threshold 标注高危（highRisk）。
 */

function scoreOf(row) {
  return typeof row?.score === 'number' && Number.isFinite(row.score) ? row.score : 0;
}

function byScoreThenId(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const aid = String(a.agentId ?? '');
  const bid = String(b.agentId ?? '');
  return aid < bid ? -1 : aid > bid ? 1 : 0;
}

/**
 * 按压力评分降序排序（稳定：同分按 agentId 升序）。
 * @param {Array<{ agentId?: string, score?: number }>} scores
 * @returns {Array<object>} 排序后的评分记录
 */
export function rank(scores = []) {
  if (!Array.isArray(scores)) {
    throw new TypeError('ranker.rank: scores 必须为数组');
  }
  return scores
    .filter((s) => s !== null && s !== undefined)
    .map((s) => ({ ...s, score: scoreOf(s) }))
    .sort(byScoreThenId);
}

/**
 * 取压力最高的前 N 名，并按 threshold 标注高危。
 * @param {Array<object>} scores
 * @param {{ n?: number, threshold?: number }} [opts]
 * @returns {Array<object>} 前 N 名（含 highRisk 标记）
 */
export function top(scores = [], opts = {}) {
  const n = opts?.n ?? 1;
  const threshold = opts?.threshold ?? 0.5;
  if (!Number.isInteger(n) || n < 0) {
    throw new TypeError('ranker.top: n 必须为 >=0 的整数');
  }
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    throw new TypeError('ranker.top: threshold 必须为有限数值');
  }
  return rank(scores).slice(0, n).map((row) => ({ ...row, highRisk: row.score >= threshold }));
}
