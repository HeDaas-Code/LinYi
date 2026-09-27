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
import * as hotLog from '../../infra/store/hot-log.js';
import * as identity from '../../infra/identity.js';
import * as episodic from '../../agent/memory/episodic/store.js';

const TYPE = 'social.platform.post';
const PREFIX = 'post:';

/**
 * 热区保留的帖子条数。
 *
 * 读者只有两处：feeds.generate 的帖子流，以及主循环 _stage2 的 recentPostIds
 * （本就只保留最近 40 条）。因此保留最近几百条足以支撑全部既有语义，
 * 而更早的帖子转入归档——仍可查询，但不再被每次 list() 遍历。
 */
const POST_HOT_LIMIT = 300;
/** 归档摘要上限。 */
const POST_ARCHIVE_LIMIT = 800;

/** 帖子 id 形如 post_000000000123（identity 发号，无点号），需自定义 seq 解析。 */
function postSeqOf(id) {
  if (typeof id !== 'string') return null;
  const m = /(\d+)$/.exec(id);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const HOT = hotLog.createLog('posts', {
  type: TYPE,
  // 帖子是**工作集**而非审计日志：只有最近的帖子会被 feed 再次读取，
  // 很早的帖子本就无人访问，可以真正移除（与决策/行为/事件的 compact 模式不同）。
  mode: 'evict',
  hotLimit: POST_HOT_LIMIT,
  archiveLimit: POST_ARCHIVE_LIMIT,
  seqOf: postSeqOf,
  // 帖子用 authorId 而非 agentId；映射成 agentId 才能让 byAgent 聚合生效。
  summarize: (d) => ({
    tick: d.tick, ts: d.createdAt, agentId: d.authorId,
    postId: d.postId, replyCount: d.replyCount, score: d.score,
  }),
});

/**
 * 把帖子收进热区上限之内；超出的同时从**图**与内存索引移除并归档。
 *
 * 必须两边同时删：byId 是唯一能读到 replies 的地方，图节点则被 list()/feeds
 * 遍历。只删一边会得到「索引里有、图里没有」或反过来的不一致状态。
 */
function enforceHotLimit() {
  while (byId.size > POST_HOT_LIMIT) {
    const oldestId = byId.keys().next().value;
    const post = byId.get(oldestId);
    byId.delete(oldestId);
    graph.remove(nodeId(oldestId));
    HOT.archive(oldestId, persistData(post));
  }
}

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

/** graph 被上层直接 __reset / __restore 后重建本派生索引（保证与图一致）。 */
function ensureFresh() {
  const gen = graph.__generation();
  if (gen !== lastGeneration) {
    rebuildFromGraph();
    lastGeneration = gen;
  }
}

/**
 * 从图重建索引。
 *
 * 图里存帖子的全部标量（作者/正文/计数/反应），**replies 只在内存**（见 persistData）。
 * 原实现只 clear() 不重建：graph 复位后 byId 为空，帖子查询全部落空。
 * 重建恢复标量与计数；replies 由 __restore 保留（重建时置空）。
 */
function rebuildFromGraph() {
  byId.clear();
  for (const node of graph.read({ type: TYPE })) {
    const d = node.data;
    if (!d || typeof d.postId !== 'string' || d.postId === '') continue;
    byId.set(d.postId, { ...d, replies: [] });
  }
  // 图里可能存有超过上限的历史（旧档，或上限下调前写入的存档），
  // 重建后必须重新收敛，否则恢复一次就突破上限。
  enforceHotLimit();
}

// ---- 持久化：帖子内存索引必须进存档（replies 只在内存里） ----

/** 导出帖子索引。 */
export function __snapshot() {
  return { byId: [...byId.entries()].map(([k, v]) => [k, structuredClone(v)]) };
}

/**
 * 恢复帖子索引（整体替换）。
 * 必须在 graph.__restore 之后调用，并把 lastGeneration 对齐到新代数。
 * @param {{byId?: Array}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('platform.posts.__restore: 状态必须为对象');
  }
  byId.clear();
  for (const pair of (Array.isArray(data.byId) ? data.byId : [])) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    if (typeof pair[0] !== 'string' || pair[0] === '') continue;
    byId.set(pair[0], structuredClone(pair[1]));
  }
  lastGeneration = graph.__generation();
  return { posts: byId.size };
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
  // 热数据上限：超出后最旧的帖子从图与索引同时移除并压入归档。
  enforceHotLimit();
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

// ---- 热数据上限的查询面 ----

/** 最近 N 条帖子（最新在前）。 */
export function recent(options = {}) {
  ensureFresh();
  const all = [...byId.values()].sort((a, b) => a.tick - b.tick || a.postId.localeCompare(b.postId));
  let filtered = all;
  if (typeof options.authorId === 'string') filtered = filtered.filter((p) => p.authorId === options.authorId);
  if (Number.isInteger(options.since)) filtered = filtered.filter((p) => p.tick >= options.since);
  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : 20;
  return filtered.slice(-limit).reverse();
}

/**
 * 解析帖子引用，返回四态：hot / archive / evicted（曾经存在）/ unknown（从未存在）。
 * 帖子被裁剪后，旧引用（回复、feed 快照、外部记录）据此仍能区分
 * 「已归档」与「从来不存在」，引用不会变成悬空的静默 null。
 */
export function lookup(postId) {
  ensureFresh();
  if (byId.has(postId)) return { found: true, source: 'hot', id: postId, record: byId.get(postId) };
  return HOT.lookup(postId);
}

/** 归档摘要（插入序 = 淘汰序）。 */
export function archived() {
  return HOT.archived();
}

/** 有界统计。 */
export function stats() {
  return HOT.stats();
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  byId.clear();
  HOT.__reset();
  graph.__reset();
}
