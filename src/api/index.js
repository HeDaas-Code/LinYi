/**
 * truman-town.api — 对外接口统一出口。
 *
 * 汇总 control（模拟控制）与 observer（观测查询）两个 HTTP 端点模块，
 * 并提供最小 HTTP 服务组装（createApiServer / start）供 t9 冒烟直接起服务。
 */

export * as control from './control.js';
export * as observer from './observer.js';
export { createRouter, createServer, HttpError } from './http.js';

import { createServer } from './http.js';
import { routes as controlRoutes } from './control.js';
import { routes as observerRoutes } from './observer.js';
import { routes as viewerRoutes } from './viewer.js';

/** 全部 HTTP 路由（控制 + 观测）。 */
export function routes() {
  return [...controlRoutes, ...observerRoutes, ...viewerRoutes];
}

/** 由全部路由构建 HTTP 服务实例。 */
export function createApiServer() {
  return createServer(routes());
}

/**
 * 启动 HTTP 服务。
 * @param {number} [port=0] 0 表示随机空闲端口
 * @param {string} [host='127.0.0.1']
 * @returns {Promise<{ server: import('node:http').Server, host: string, port: number }>}
 */
export function start(port = 0, host = '127.0.0.1') {
  const server = createApiServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        host: typeof address === 'string' ? address : host,
        port: (typeof address === 'object' && address !== null && typeof address.port === 'number') ? address.port : port,
      });
    });
  });
}
