/**
 * truman-town.api 内部 HTTP 辅助（不作为 Normify 模块暴露）。
 *
 * 提供最小可用的 JSON HTTP 服务：路由匹配（支持 :param 路径段）、请求体解析、
 * 统一 JSON 响应与错误处理。仅依赖 Node 内置 http 模块，便于测试与 t9 冒烟。
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
 * 由路由表构建请求处理函数。
 * @param {Array<{ method: string, path: string, handler: (ctx) => any }>} routes
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
    try {
      for (const route of routes) {
        if (route.method !== method) continue;
        const params = matchPath(route.path, url.pathname);
        if (params === null) continue;
        const body = await readBody(req);
        const result = await route.handler({ params, query: url.searchParams, body });
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
      sendJson(res, status, { error: err instanceof Error ? err.message : 'internal error' });
    }
  };
}

/** 由路由表构建 HTTP 服务。 */
export function createServer(routes) {
  return http.createServer(createRouter(routes));
}
