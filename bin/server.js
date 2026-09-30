#!/usr/bin/env node
/**
 * truman-town API 服务入口（手动运行 / t9 冒烟）：
 *   PORT=3000 node bin/server.js
 */

process.loadEnvFile?.('.env');

import { start } from '../src/api/index.js';
import * as control from '../src/api/control.js';
import * as observer from '../src/api/observer.js';
import * as gateway from '../src/ai/llm/gateway.js';
import * as loop from '../src/runtime/orchestrator/loop.js';
import * as metronome from '../src/runtime/orchestrator/metronome.js';

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

const savePath = process.env.TRUMAN_SAVE_PATH?.trim() || '.data/linyi-run.json';
const recovered = await observer.initializeSnapshotStorage(savePath);
if (recovered.restored) console.log(`truman-town restored tick=${recovered.tick} snapshot=${recovered.file}`);

const { server, port: boundPort } = await start(port, host);
console.log(`truman-town api listening on http://${host}:${boundPort}`);
console.log(`truman-town llm mode=${profile.mode} provider=${profile.provider} model=${profile.model} enabled=${profile.enabled}`);

let shutdownPromise = null;
const shutdown = (signal) => {
  if (shutdownPromise !== null) return shutdownPromise;
  shutdownPromise = (async () => {
    const closed = new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    server.closeIdleConnections?.();
    const autosaveBefore = metronome.autosaveStatus();
    try {
      await control.stop({ wait: true });
      while (loop.tickStatus().inFlight === true) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      const current = loop.snapshot();
      const hasRun = current.agents.length > 0 || loop.tickStatus().committedTick > 0;
      const autosaveAfter = metronome.autosaveStatus();
      const stoppedAndSaved = autosaveAfter.count > autosaveBefore.count
        && autosaveAfter.lastReason === 'stop'
        && autosaveAfter.lastAtTick === loop.tickStatus().committedTick;
      if (hasRun && stoppedAndSaved === false) await observer.saveRunToDisk({ reason: 'shutdown' });
    } catch (err) {
      process.exitCode = 1;
      console.error(`[shutdown:${signal}]`, err instanceof Error ? err.message : String(err));
    } finally {
      server.closeAllConnections?.();
      try { await closed; } catch (err) {
        process.exitCode = 1;
        console.error('[shutdown]', err instanceof Error ? err.message : String(err));
      }
    }
  })();
  return shutdownPromise;
};
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
