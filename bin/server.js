#!/usr/bin/env node
/**
 * truman-town API 服务入口（手动运行 / t9 冒烟）：
 *   PORT=3000 node bin/server.js
 */

import { start } from '../src/api/index.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';

const { server, port: boundPort } = await start(port, host);
console.log('truman-town api listening on http://' + host + ':' + boundPort);

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
