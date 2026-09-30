#!/usr/bin/env node
/**
 * truman-town API 服务入口（手动运行 / t9 冒烟）：
 *   PORT=3000 node bin/server.js
 */

process.loadEnvFile?.('.env');

import { start } from '../src/api/index.js';
import * as control from '../src/api/control.js';
import * as gateway from '../src/ai/llm/gateway.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const mode = process.env.TRUMAN_LLM_MODE ?? 'off';
if (!['off', 'sample', 'population'].includes(mode)) {
  throw new Error('TRUMAN_LLM_MODE must be off, sample, or population');
}
let provider = gateway.provider();
if (mode !== 'off') {
  if (!process.env.A6API_KEY) {
    throw new Error('LLM mode requires A6API_KEY; set TRUMAN_LLM_MODE=off for rule-only mode');
  }
  provider = gateway.useA6Api(process.env);
}
const numberEnv = (name, fallback, min = 0) => {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isFinite(value) || value < min) throw new Error(`${name} must be a number >= ${min}`);
  return value;
};
const profile = {
  mode,
  enabled: mode !== 'off',
  provider: provider.name,
  model: provider.model,
  maxAgents: Math.floor(numberEnv('TRUMAN_LLM_MAX_AGENTS', 1)),
  populationShare: numberEnv('TRUMAN_LLM_POPULATION_SHARE', 0.1),
  concurrency: Math.floor(numberEnv('TRUMAN_LLM_CONCURRENCY', 2, 1)),
  everyTicks: Math.floor(numberEnv('TRUMAN_LLM_EVERY_TICKS', 5, 1)),
};
if (profile.populationShare > 1) throw new Error('TRUMAN_LLM_POPULATION_SHARE must be between 0 and 1');
control.configureAiRuntime(profile);

const { server, port: boundPort } = await start(port, host);
console.log(`truman-town api listening on http://${host}:${boundPort}`);
console.log(`truman-town llm mode=${profile.mode} provider=${profile.provider} model=${profile.model} enabled=${profile.enabled}`);

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
