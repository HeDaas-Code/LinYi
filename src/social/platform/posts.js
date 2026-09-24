/**
 * truman-town.social.platform.posts — 帖子 / Posts
 *
 * 发布、回复与回应（点赞/踩）帖子，承载公共表达。发帖内容由居民处境驱动
 * （_stage2 依据饥饿/患病/贫困等真实状态拼装，不调用真实大模型）。
 * 依赖 agent.memory.episodic：发帖/回复会写入作者情景记忆。
 *
 * 为消除 reply/react/get 每次对整帖（含 replies 数组）graph.read + structuredClone
 * 深拷贝热点（t53 性能回归根因之一），本模块额外维护按 postId 的内存索引（byId），
 * graph 仅作持久化落盘；读取走索引，写入照常落盘一次。与 episodic.store /
 * social.reputation 的 ensureFresh()（graph.__generation() 失效）同款做法。
 */

import * as graph from '../../infra/store/graph.js';
import * as identity from '../../infra/identity.js';
import * as episodic from '../../agent/memory/episodic/store.js';

const TYPE = 'social.platform.post';
const PREFIX = 'post:';

function nodeId(postId) {
  return PREFIX + postId;
}

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('platform.posts: ' + label + ' 必须为非空字符串');
  }
}

/** @type {Map<string, object>} postId → 帖子（含 replies / reactions）。 */
const byId = new Map();

/** 上次校验的 graph 复位代数；graph 被直接 __reset 时使本索引失效。 */
let lastGeneration = -1;

/** graph 被上层直接 __reset 后重建本派生索引（保证与图一致）。 */
function ensureFresh() {
  const gen = graph.__generation();
  if (gen !== lastGeneration) {
    byId.clear();
    lastGeneration = gen;
  }
}

/** 落盘视图：剥离 replies 数组（仅存于内存索引），避免每次 reply/react 深拷贝整条回复链。 */
function persistData(post) {
  const { replies, ...rest } = post;
  return rest;
}

/**
 * 发帖：调用 social.platform.posts.publish。
 * @param {{ authorId: string, content: string, context?: string, tick?: number, salience?: number }} input
 * @returns {object} 帖子快照
 */
export function publish({ authorId, content, context = 'general', tick = 0, salience = 0.5 } = {}) {
  assertId(authorId, 'authorId');
  if (typeof content !== 'string' || content.trim() === '') {
    throw new TypeError('platform.posts.publish: content 必须为非空字符串');
  }
  ensureFresh();
  const postId = identity.next('post');
  const post = {
    postId,
    authorId,
    content,
    context,
    tick,
    salience,
    replies: [],
    replyCount: 0,
    reactions: { up: 0, down: 0 },
    score: 0,
    createdAt: Date.now(),
  };
  byId.set(postId, post);
  graph.write({ id: nodeId(postId), type: TYPE, data: persistData(post) });
  // 依赖 agent.memory.episodic：把发帖行为写入作者情景记忆
  try {
    episodic.write(authorId, { ts: tick, content: '发帖：' + content, emotion: null, salience, tags: ['post', context] });
  } catch { /* 情景记忆不可用则跳过 */ }
  return post;
}

/**
 * 回复帖子：调用 social.platform.posts.reply。
 * @param {{ postId: string, authorId: string, content: string, tick?: number }} input
 * @returns {object|null} 更新后的帖子快照；帖子不存在返回 null
 */
export function reply({ postId, authorId, content, tick = 0 } = {}) {
  assertId(postId, 'postId');
  assertId(authorId, 'authorId');
  if (typeof content !== 'string' || content.trim() === '') {
    throw new TypeError('platform.posts.reply: content 必须为非空字符串');
  }
  ensureFresh();
  const post = byId.get(postId);
  if (!post) return null;
  const replyId = identity.next('reply');
  post.replies = [...(post.replies ?? []), { replyId, authorId, content, tick }];
  post.replyCount = post.replies.length;
  graph.write({ id: nodeId(postId), type: TYPE, data: persistData(post) });
  try {
    episodic.write(authorId, { ts: tick, content: '回复帖子：' + content, emotion: null, salience: 0.4, tags: ['post', 'reply'] });
  } catch { /* 情景记忆不可用则跳过 */ }
  return post;
}

/**
 * 回应帖子（点赞/踩）：调用 social.platform.posts.react。
 * @param {{ postId: string, agentId: string, kind?: 'up'|'down', tick?: number }} input
 * @returns {object|null} 更新后的帖子快照；帖子不存在返回 null
 */
export function react({ postId, agentId, kind = 'up', tick = 0 } = {}) {
  assertId(postId, 'postId');
  assertId(agentId, 'agentId');
  if (kind !== 'up' && kind !== 'down') {
    throw new TypeError('platform.posts.react: kind 必须为 up 或 down');
  }
  ensureFresh();
  const post = byId.get(postId);
  if (!post) return null;
  post.reactions = { up: (post.reactions?.up ?? 0), down: (post.reactions?.down ?? 0) };
  post.reactions[kind] += 1;
  graph.write({ id: nodeId(postId), type: TYPE, data: persistData(post) });
  return post;
}

/** 读取单帖（辅助）。 */
export function get(postId) {
  assertId(postId, 'postId');
  ensureFresh();
  return byId.get(postId) ?? null;
}

/** 列出全部帖子（按 postId 稳定排序，辅助）。 */
export function list() {
  ensureFresh();
  return [...byId.values()].sort((a, b) => a.postId.localeCompare(b.postId));
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  byId.clear();
  graph.__reset();
}
