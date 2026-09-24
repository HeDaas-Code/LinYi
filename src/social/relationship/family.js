/**
 * truman-town.social.relationship.family — 家庭关系 / Family Relationship
 *
 * 追溯亲缘路径（父子/祖孙/姻亲）并给出关系标签。依赖 family.registry（家族成员名册）
 * 与 family.lineage（父子女/代际）。trace 在父母/子女边上 BFS 找最短亲缘路径；label
 * 给出方向化标签（父辈/子女/兄弟姐妹/祖辈/孙辈/配偶/姻亲/本人/无亲缘）。
 */

import * as registry from '../family/registry.js';
import * as lineage from '../family/lineage.js';

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('relationship.family: ' + label + ' 必须为非空字符串');
  }
}

function tr(id) {
  return lineage.trace({ agentId: id });
}

/** 亲缘路径 BFS（沿父母/子女边）。 */
function kinshipPath(from, to) {
  if (from === to) return { kind: 'self', path: [from], depth: 0 };
  const queue = [{ cur: from, path: [from] }];
  const visited = new Set([from]);
  while (queue.length > 0) {
    const { cur, path } = queue.shift();
    const t = tr(cur);
    if (!t) continue;
    const neighbors = new Set([...(t.parents ?? []), ...(t.children ?? [])]);
    for (const n of neighbors) {
      if (n === to) return { kind: label({ from, to }), path: [...path, n], depth: path.length };
      if (!visited.has(n)) {
        visited.add(n);
        queue.push({ cur: n, path: [...path, n] });
      }
    }
  }
  return null;
}

/** 追溯：调用 social.relationship.family.trace。 */
export function trace({ from, to } = {}) {
  assertId(from, 'from');
  assertId(to, 'to');
  const p = kinshipPath(from, to);
  if (p === null) return null;
  return { from, to, kind: p.kind, label: p.kind, depth: p.depth, path: p.path };
}

/** 标签：调用 social.relationship.family.label。 */
export function label({ from, to } = {}) {
  assertId(from, 'from');
  assertId(to, 'to');
  if (from === to) return '本人';
  const a = tr(from);
  const b = tr(to);
  if (!a || !b) return '无亲缘';

  if ((a.children ?? []).includes(to)) return '子女';
  if ((a.parents ?? []).includes(to)) return '父辈';

  const sharedParents = (a.parents ?? []).filter((p) => (b.parents ?? []).includes(p));
  if (sharedParents.length > 0) return '兄弟姐妹';

  if ((a.ancestors ?? []).includes(to)) return '祖辈';
  if ((b.ancestors ?? []).includes(from)) return '孙辈';

  const sharedChildren = (a.children ?? []).filter((c) => (b.children ?? []).includes(c));
  if (sharedChildren.length > 0) return '配偶';

  // 姻亲：from 的配偶（共同育儿者）是 to 的血亲
  for (const childId of (a.children ?? [])) {
    const ct = tr(childId);
    if (!ct) continue;
    const other = (ct.parents ?? []).find((p) => p !== from);
    if (other === undefined || other === to) continue;
    const ot = tr(other);
    if (!ot) continue;
    const bloodRelated = (ot.ancestors ?? []).includes(to)
      || (b.ancestors ?? []).includes(other)
      || ((ot.parents ?? []).some((p) => (b.parents ?? []).includes(p)));
    if (bloodRelated) return '姻亲';
  }

  // 同一家族但无直系血亲 → 族人
  const famA = registry.lookup({ memberId: from });
  const famB = registry.lookup({ memberId: to });
  if (famA.some((f) => famB.some((g) => g.familyId === f.familyId))) return '族人';

  return '无亲缘';
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph_reset();
}

function graph_reset() {
  registry.__reset();
}

