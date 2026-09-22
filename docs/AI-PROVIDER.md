# AI Provider 接入指南

`ai.llm.gateway` 通过可插拔 provider 适配器接入语言模型。默认使用确定性 `stub` 适配器（离线、可复现），可通过 `registerProvider()` / `useA6Api()` 切换到真实模型。

## Provider 一览

| provider | 说明 | complete | embed |
|---|---|---|---|
| `stub` | 默认，确定性回显 + 哈希向量 | ✅ | ✅ |
| `a6api` | OpenAI 兼容真实推理模型（默认 grok-4.6） | ✅ | ❌（无 embedding 模型，回退 stub） |

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

## 基准脚本

```bash
# Node >= 20.6 支持 --env-file；按需调整次数
node --env-file=.env bin/bench.js --n 3
```

脚本打印每次调用的墙钟耗时与 usage 统计（prompt / completion / reasoning tokens、cost_in_usd_ticks），不打印 key。
