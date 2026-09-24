/**
 * truman-town.social.family.chronicle — 家族编年史 / Family Chronicle
 *
 * 记录家族重大事件（成立/出生/婚配/死亡/破产/荣誉），compile 生成可读编年，
 * 供文明遗产继承。依赖 lineage 枚举家族成员与代际（dataflow）。
 */

import * as graph from '../../infra/store/graph.js';
import * as lineage from './lineage.js';

const TYPE = 'social.family.chronicle';
const PREFIX = 'chronicle:';

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('family.chronicle: ' + label + ' 必须为非空字符串');
  }
}

function nodeId(familyId) {
  return PREFIX + familyId;
}

function clone(v) {
  return v === undefined ? undefined : structuredClone(v);
}

function summarize(e) {
  switch (e.event) {
    case 'founding':
      return '家族于 tick ' + e.tick + ' 成立（创立者 ' + e.actor + '）';
    case 'birth':
      return '成员 ' + e.actor + ' 于 tick ' + e.tick + ' 出生';
    case 'marriage':
      return '成员 ' + e.actor + ' 于 tick ' + e.tick + ' 婚配';
    case 'death':
      return '成员 ' + e.actor + ' 于 tick ' + e.tick + ' 去世（' + (e.detail?.cause ?? '未知原因') + '）';
    case 'bankruptcy':
      return '成员 ' + e.actor + ' 于 tick ' + e.tick + ' 破产';
    case 'honor':
      return '成员 ' + e.actor + ' 于 tick ' + e.tick + ' 获得荣誉';
    default:
      return 'tick ' + e.tick + ' 发生事件 ' + e.event;
  }
}

/** 追加事件：调用 social.family.chronicle.append。 */
export function append({ familyId, event, tick = 0, actor = null, detail = null } = {}) {
  assertId(familyId, 'familyId');
  if (typeof event !== 'string' || event.trim() === '') {
    throw new TypeError('family.chronicle: event 必须为非空字符串');
  }
  const node = graph.read(nodeId(familyId));
  const entries = node && node.data && Array.isArray(node.data.entries) ? [...node.data.entries] : [];
  const entry = { event, tick: typeof tick === 'number' ? tick : 0, actor, detail: clone(detail), ts: Date.now() };
  entries.push(entry);
  graph.write({ id: nodeId(familyId), type: TYPE, data: { familyId, entries } });
  return clone(entry);
}

/** 编译编年：调用 social.family.chronicle.compile（生成可读家族史）。 */
export function compile({ familyId } = {}) {
  assertId(familyId, 'familyId');
  const node = graph.read(nodeId(familyId));
  const entries = (node && node.data && Array.isArray(node.data.entries) ? node.data.entries : [])
    .slice()
    .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
  const generations = lineage.generation({ familyId });
  return {
    familyId,
    generations,
    entries: entries.map((e) => ({
      tick: e.tick,
      event: e.event,
      actor: e.actor,
      summary: summarize(e),
    })),
  };
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}

