/**
 * truman-town.api 内部 HTTP 辅助（不作为 Normify 模块暴露）。
 *
 * 提供最小可用的 JSON HTTP 服务：路由匹配（支持 :param 路径段）、请求体解析、
 * 统一 JSON 响应与错误处理。仅依赖 Node 内置 http 模块，便于测试与 t9 冒烟。
 *
 * t16 增加**流式路由**（Server-Sent Events）：观测 API 需要一个「阶段流」——
 * 一次 tick 在 50 人规模下约 225ms，轮询要么太慢看不到中间态、要么太密浪费请求。
 * 标记 `stream: true` 的路由自己接管 res（写 SSE 帧、决定何时结束），
 * 路由器只负责把请求送进去、并在异常时保证连接被收尾（不会挂死）。
 */

import http from 'node:http';

/** 带 HTTP 状态码的错误，供路由处理函数抛出。 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 读取请求体（仅 JSON，空体返回 undefined）。 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1000000) {
        reject(new HttpError(413, 'body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim() === '') return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/** 把 "/api/v1/agents/:agent_id" 与 pathname 匹配，返回路径参数或 null。 */
function matchPath(pattern, pathname) {
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    const seg = p[i];
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(a[i]);
    } else if (seg !== a[i]) {
      return null;
    }
  }
  return params;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * 开启一个 SSE 响应。调用后该路由拥有 res，不得再写 JSON。
 *
 * `X-Accel-Buffering: no` 与 `no-cache` 是必须的：否则反向代理会缓冲整个响应，
 * 观测者要等到流结束才看到第一帧——那就完全失去了"流"的意义。
 * @param {import('node:http').ServerResponse} res
 * @param {{ retryMs?: number }} [opts]
 */
export function sendEventStream(res, opts = {}) {
  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
  res.writeHead(200, headers);
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  if (Number.isInteger(opts.retryMs) && opts.retryMs > 0) res.write('retry: ' + opts.retryMs + '\n\n');
}

/**
 * 写一帧 SSE 事件。data 一律 JSON 序列化——观测数据是结构化的，
 * 让客户端自己拼字符串只会把解析责任推给每个消费者。
 * @param {import('node:http').ServerResponse} res
 * @param {string} event 事件名（status / progress / failure / done）
 * @param {unknown} data
 */
export function writeSse(res, event, data) {
  if (res.writableEnded === true) return false;
  const payload = JSON.stringify(data ?? null);
  res.write('event: ' + event + '\n' + 'data: ' + payload + '\n\n');
  return true;
}

/**
 * 由路由表构建请求处理函数。
 *
 * 路由表字段：
 *   method / path / handler(ctx)
 *   stream?: true  → 该 handler 接管 res（SSE）；路由器不再写 JSON。
 * ctx = { params, query, body, req, res }
 * @param {Array<{ method: string, path: string, handler: (ctx: any) => any, stream?: boolean }>} routes
 */
export function createRouter(routes) {
  return async (req, res) => {
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return sendJson(res, 400, { error: 'bad url' });
    }
    const method = req.method ?? 'GET';
    let streaming = false;
    try {
      for (const route of routes) {
        if (route.method !== method) continue;
        const params = matchPath(route.path, url.pathname);
        if (params === null) continue;
        const body = await readBody(req);
        const ctx = { params, query: url.searchParams, body, req, res };
        if (route.stream === true) {
          streaming = true;
          // 流式路由自己负责收尾（含正常结束与异常结束）。
          await route.handler(ctx);
          return;
        }
        const result = await route.handler(ctx);
        if (result === undefined || result === null) {
          res.writeHead(204);
          return res.end();
        }
        return sendJson(res, 200, result);
      }
      sendJson(res, 404, { error: 'not found', path: url.pathname, method });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error('[api]', err);
      // 流式路由可能已经发过响应头：此时不能再写 JSON（会抛 ERR_HTTP_HEADERS_SENT），
      // 只能尽力结束连接，避免把客户端挂在半开状态。
      if (streaming || res.headersSent === true) {
        try { res.end(); } catch { /* 连接可能已断开 */ }
        return;
      }
      sendJson(res, status, { error: err instanceof Error ? err.message : 'internal error' });
    }
  };
}

/** 由路由表构建 HTTP 服务。 */
export function createServer(routes) {
  return http.createServer(createRouter(routes));
}
