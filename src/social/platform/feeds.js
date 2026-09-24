/**
 * truman-town.social.platform.feeds — 信息流 / Feeds
 *
 * 按社区归属、关系权重与作者声誉，为某居民生成并排序信息流（谁看到什么）。
 * 依赖 social.graph.community（社区归属）与 social.reputation（作者声誉权重）。
 */

import * as posts from './posts.js';
import * as community from '../graph/community.js';
import * as edges from '../graph/edges.js';
import * as reputation from '../reputation.js';

function clone(v) {
  return v === undefined ? undefined : structuredClone(v);
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('platform.feeds: agentId 必须为非空字符串');
  }
}

/**
 * 排序信息流：调用 social.platform.feeds.rank。
 * 评分因子：时效 + 社区亲和 + 关系权重 + 作者声誉 + 帖子互动热度。
 * @param {{ agentId: string, posts: Array<object>, communitySnapshot?: object, tick?: number }} input
 * @returns {Array<object>} 带 score 的帖子数组（降序）
 */
export function rank({ agentId, posts: postList, communitySnapshot, tick = 0 } = {}) {
  assertAgentId(agentId);
  const list = Array.isArray(postList) ? postList : [];
  const snap = communitySnapshot ?? null;
  const viewerCommunity = snap && snap.mapping ? (snap.mapping[agentId] ?? null) : (community.belong({ agentId }).communityId);

  return list.map((p) => {
    let score = (typeof p.salience === 'number' ? p.salience : 0.5);

    // 时效：越新越高（0~1，半衰 20 tick）
    const age = Math.max(0, tick - (p.tick ?? 0));
    score += 0.5 * Math.exp(-age / 20);

    // 社区亲和：同社区作者 +0.3
    const authorCommunity = snap && snap.mapping ? (snap.mapping[p.authorId] ?? null) : (community.belong({ agentId: p.authorId }).communityId);
    if (viewerCommunity !== null && authorCommunity === viewerCommunity) score += 0.3;

    // 关系权重：与作者的关系边越强越靠前
    let relWeight = 0;
    if (p.authorId !== agentId) {
      const edge = edges.between({ a: agentId, b: p.authorId });
      relWeight = edge && typeof edge.weight === 'number' ? edge.weight : 0;
    }
    score += Math.min(0.5, relWeight * 0.1);

    // 作者声誉：高声誉者内容更可见（声誉被读取的反馈点之一）
    const rep = reputation.query({ agentId: p.authorId });
    score += 0.4 * ((rep.score - 50) / 50);

    // 互动热度：点赞减踩（封顶 ±0.5）
    const up = p.reactions?.up ?? 0;
    const down = p.reactions?.down ?? 0;
    score += Math.max(-0.5, Math.min(0.5, (up - down) * 0.05));

    return { ...clone(p), _score: score };
  }).sort((a, b) => (b._score - a._score) || a.postId.localeCompare(b.postId));
}

/**
 * 生成信息流：调用 social.platform.feeds.generate。
 * @param {{ agentId: string, limit?: number, communitySnapshot?: object, tick?: number }} input
 * @returns {Array<object>} 已排序的帖子数组（截断到 limit）
 */
export function generate({ agentId, limit = 8, communitySnapshot, tick = 0 } = {}) {
  assertAgentId(agentId);
  const all = posts.list();
  const ranked = rank({ agentId, posts: all, communitySnapshot, tick });
  return ranked.slice(0, Number.isInteger(limit) && limit > 0 ? limit : 8);
}
