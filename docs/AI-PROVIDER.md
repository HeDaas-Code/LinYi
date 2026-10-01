# AI Provider 接入指南

`ai.llm.gateway` 通过可插拔 provider 适配器接入语言模型。默认使用确定性 `stub` 适配器（离线、可复现），可通过 `registerProvider()` / `useA6Api()` / `useLocalEmbed()` 切换到真实模型或本地嵌入。

## Provider 一览

| provider | 说明 | complete | embed |
|---|---|---|---|
| `stub` | 默认，确定性回显 + 哈希向量 | ✅ | ✅ |
| `a6api` | OpenAI 兼容真实推理模型（默认 grok-4.6） | ✅ | ❌（无 embedding 模型，回退 stub） |
| `local` | 本地 MiniLM 嵌入（onnxruntime，384 维） | ❌（仅嵌入） | ✅（缺依赖/模型时回退 stub） |

## A6API 配置（环境变量）

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `A6API_KEY` | ✅ | — | API Key（缺省报错） |
| `A6API_BASE_URL` | ❌ | `https://api.a6api.com/v1` | OpenAI 兼容 base URL |
| `A6API_MODEL` | ❌ | `grok-4.6` | 模型名 |

配置示例（写入 `.env`，已被 `.gitignore` 忽略，勿提交）：

```
A6API_KEY=sk-xxxx
A6API_BASE_URL=https://api.a6api.com/v1
A6API_MODEL=grok-4.6
```

> ⚠️ 安全：**绝不**在日志、测试或报告中打印 `A6API_KEY` 的值；只允许出现变量名。`.env` 不加入 git。

## 使用方式

```js
import { gateway } from './src/ai/index.js';

// 方式一：创建并切换为默认 provider（等价于读 process.env）
gateway.useA6Api();

// 方式二：只登记不切换，按名/按对象使用
gateway.registerFromEnv();
const out = await gateway.complete({
  provider: 'a6api',
  messages: [{ role: 'user', content: '你好' }],
});

// 返回体含 usage（含 reasoningTokens / costInUsdTicks）
console.log(out.usage.reasoningTokens, out.usage.costInUsdTicks);
```

## 关键约束

- **grok-4.6 是推理模型**：`complete()` 透传 `reasoning_effort`，默认 `"minimal"`，否则 `completion_tokens` 会膨胀到 200+。可覆盖：`gateway.complete({ provider, messages, reasoning_effort: 'high' })`。
- **embed 不支持**：A6API `/models` 只有 5 个 chat 模型、无 embedding 模型，`embed()` 抛错，需回退 `stub` 适配器（`ai.llm.gateway` 默认 stub 的 `embed` 仍可用）。
- **并发收益低**：单次约 6–9 秒、6 并发约 23 秒（上游排队），MVP 建议串行调用。

## 本地嵌入（onnxruntime + MiniLM）

`gateway.embed` 可切换到本地嵌入 provider（`all-MiniLM-L6-v2`，384 维），无需外部 API。

### 安装依赖

`onnxruntime-node` 以 optionalDependencies 登记，默认不安装（项目 `npm test` 零依赖全绿）：

```bash
npm install onnxruntime-node@1.20.1
# 或整体安装（含 optional）：npm install
```

体积约 849MB（含 CUDA 二进制）。

### 获取模型

```bash
mkdir -p models/all-MiniLM-L6-v2/onnx
curl -L -o models/all-MiniLM-L6-v2/tokenizer.json https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json
curl -L -o models/all-MiniLM-L6-v2/onnx/model.onnx https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx
```

> `model.onnx` 约 90MB、`tokenizer.json` 约 466KB。

### 使用

```js
import { gateway } from './src/ai/index.js';

gateway.useLocalEmbed({ modelDir: './models/all-MiniLM-L6-v2' }); // 或 TRUMAN_EMBED_MODEL_DIR
const r = await gateway.embed({ texts: ['你好', '世界'] });
console.log(r.dim, r.provider, r.fallback); // 384 local null
```

环境变量：`TRUMAN_EMBED_PROVIDER=local`（默认 `stub`）、`TRUMAN_EMBED_MODEL_DIR`（默认 `./models/all-MiniLM-L6-v2`）；`registerFromEnv()` 会读取这两个变量自动切换。

### 回退规则

本地嵌入绝不使主流程失败：
- 依赖未装（`onnxruntime-node` 缺失）、模型文件缺失、推理异常 → 自动回退确定性 hash 向量，并在返回值 `fallback` 字段标注原因（字符串）。
- 成功时 `fallback` 为 `null`。
- `complete()` 不支持（本地仅嵌入），调用抛明确错误。

### 体积与性能

单条文本为本地 CPU 推理，无网络往返；会话懒加载并缓存（单例），首次加载约数秒。`models/` 与 `node_modules/` 均已加入 `.gitignore`，不提交进 git。

## 基准脚本

```bash
# Node >= 20.6 支持 --env-file；按需调整次数
node --env-file=.env bin/bench.js --n 3
```

脚本打印每次调用的墙钟耗时与 usage 统计（prompt / completion / reasoning tokens、cost_in_usd_ticks），不打印 key。

## Population decision mode

The runtime population entry point is `loop.step()` (or `loop.run()`), with these options:

```js
await loop.step({
  llmDecideMode: 'population',
  llmDecideMaxAgents: 0,       // 0 means all living residents
  llmDecidePopulationShare: 1, // rotating share per tick
  llmDecideConcurrency: 4,
});
```

`llmDecideMode` defaults to `off`. `sample` selects the first bounded set; `population` rotates a bounded set across living residents. The model remains fail-soft: invalid output falls back to the rule decision. `llmDecideEnabled: true` is the legacy alias for `sample`.

The HTTP server also defaults to rule-only mode (`TRUMAN_LLM_MODE=off`). To opt into model-backed decisions, set `TRUMAN_LLM_MODE=population` and provide `A6API_KEY`. Population mode samples residents every tick by default, with up to three model calls per tick (`TRUMAN_LLM_MAX_AGENTS=3`, `TRUMAN_LLM_EVERY_TICKS=1`). The default population share is `0.5`; residents who have gone longer without a model call receive greater weight in later draws. Set `TRUMAN_LLM_MAX_AGENTS=0` only when intentionally allowing every living resident to be considered. Concurrency defaults to `2`.

`bin/server.js` uses Node's `process.loadEnvFile` when available (Node.js 20.6+). On Node.js 18, export these variables in the process environment before starting the server.
