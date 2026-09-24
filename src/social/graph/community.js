/**
 * truman-town.social.graph.community — 社区发现 / Community Detection
 *
 * 基于关系边做社区聚类（并查集连通分量，零第三方依赖）。detect 返回全部连通分量
 *（按规模降序、最小成员 id 升序稳定排序），belong 查询某个体所属社区。阈值 threshold
 * 过滤弱互动边（如交易），使社区由强关系（家人/恋人/朋友）构成。
 */

import * as edges from './edges.js';

function clone(v) {
  return v === undefined ? undefined : structuredClone(v);
}

function sortIds(ids) {
  return [...new Set(ids)].sort();
}

/** 并查集连通分量。 */
function components(edgeList, threshold) {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  };
  const union = (x, y) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  for (const e of edgeList) {
    if (e.removed === true) continue;
    if (typeof threshold === 'number' && (e.weight ?? 0) < threshold) continue;
    union(e.a, e.b);
  }
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()].map((g) => sortIds(g));
}

/** 检测社区：调用 social.graph.community.detect。 */
export function detect({ threshold = 0.5 } = {}) {
  const edgeList = edges.list();
  const comps = components(edgeList, typeof threshold === 'number' ? threshold : 0.5);
  comps.sort((x, y) => y.length - x.length || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  const communities = comps.map((members, i) => ({ communityId: 'c_' + i, members, size: members.length }));
  const mapping = {};
  for (const c of communities) {
    for (const m of c.members) mapping[m] = c.communityId;
  }
  return { count: communities.length, communities, mapping };
}

/** 查询归属：调用 social.graph.community.belong。 */
export function belong({ agentId, threshold = 0.5 } = {}) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('graph.community: agentId 必须为非空字符串');
  }
  const det = detect({ threshold });
  const cid = det.mapping[agentId];
  if (cid === undefined) return { agentId, communityId: null, members: [agentId], size: 1 };
  const c = det.communities.find((x) => x.communityId === cid);
  return { agentId, communityId: cid, members: clone(c.members), size: c.size };
}

/** 复位底层状态（测试用）。 */
export function __reset() {
  edges.__reset();
}

