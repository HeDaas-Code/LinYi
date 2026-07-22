# NovelPilot 技术笔记

> 源码路径：`/workspace/docs/refs/novelpilot/`
> 语言：TypeScript（Next.js 全栈）
> 关注模块：`lib/agents.ts`、`lib/types.ts`、`lib/agent-retry.ts`、`lib/agent-fallbacks.ts`、`lib/prompts.ts`、`lib/agent-context.ts`

## 项目概述

NovelPilot 是一个 Next.js 实现的多 Agent 顺序流水线小说生成器，核心是 9 个 Agent 的固定顺序编排：**Premise Architect（concept）→ Character Director（character）→ World Builder（worldbuilding）→ Plot Strategist（plot）→ Chapter Architect（chapter-outline）→ Prose Writer（drafting）→ Style Editor（editor）→ Continuity Detective（continuity）→ Publisher Agent（publisher）**。每个 Agent 的输出是下一个 Agent 的输入，所有输出汇聚到单一真源容器 `StoryBible`（`lib/types.ts`），包含 concept/theme/genre/tone/characters/worldbuilding/plot/parts/chapters/styleGuide/foreshadowingTracker。Agent 失败时有三层防线：retry（maxRetries=2）→ fallback（每个 agent 都有降级输出）→ resetFromAgent（按 agent index 回滚后续状态）。所有 Agent 输出由 JSON schema 驱动（`lib/prompts.ts` 的 `SCHEMAS` 字典），`COMPACT_JSON_RULES` 强制"valid JSON only, no markdown, no explanations"。

## 核心创新点

1. **Foreshadowing Tracker 作为一等公民数据结构**（`lib/types.ts` 的 `ForeshadowingItem`）：字段包含 `item/introducedIn/status/suggestedPayoff/payoffChapter/emotionalPurpose`。关键在于 `emotionalPurpose`——伏笔不只是"埋了要收"，还要明确"为什么埋这个伏笔"的情感意图，这使得 Continuity Detective 能审计"伏笔回收是否兑现了情感承诺"，而非仅"伏笔是否被提到"。`status` 枚举 `planned|unresolved|paid-off` 贯穿 plot → chapter-outline → continuity 三个 agent，`prompts.ts:38-48` 的 `CHAPTER_OUTLINE_SCHEMA` 直接嵌入 `foreshadowingTracker` 字段，使章节规划阶段就强制声明本章埋/收哪些伏笔。

2. **Continuity Detective 的结构化输出**（`lib/types.ts` 的 `ContinuityIssue` + `prompts.ts:96-102`）：issue 含 `category/severity/issue/evidence/suggestedFix` 五字段。`category` 枚举 `character|timeline|foreshadowing|worldbuilding|motif`，`severity` 枚举 `low|medium|high`——分类 + 分级使问题可优先级排序、可按类别统计。除 issues 外还输出 `unresolvedForeshadowing`、`repeatedMotifs`、`missingPayoffs`、`overallDiagnosis`，是"审计报告"而非"问题列表"。

3. **Agent 失败的三层防线**：
   - **retry 分类**（`lib/agent-retry.ts:28-80`）：`NON_RETRYABLE_PATTERNS`（401/402/403/504/unauthorized/insufficient credits/model not found 等）直接放弃；`RETRYABLE_PATTERNS`（timeout/invalid json/502/503/rate limit/network 等）才重试。`isRetryableError`（行 71-80）默认 true——未知错误先重试，避免误伤。`DEFAULT_AGENT_RETRY_POLICY` maxRetries=2、retryDelayMs=1200（行 8-11）。
   - **fallback 全覆盖**（`lib/agent-fallbacks.ts:259-285` 的 `buildFallbackAgentOutput`）：9 个 agent 每个都有降级输出，中英日三语支持。fallback 不是"空对象"，而是结构完整的占位内容（如 `buildFallbackCharacter` 行 47-119 返回完整 protagonist/antagonist/supporting 三角色块）。
   - **resetFromAgent 按 index 回滚**（`lib/agents.ts`）：某个 agent 失败且 fallback 不可用时，按 agent index 回退后续所有 agent 的状态，使流水线可从中间 agent 重启而非从头来。

## 可直接复用的设计

- **ForeshadowingItem 数据结构**（`lib/types.ts`）：`emotionalPurpose` 字段是关键创新，LinYi 的伏笔追踪应直接采纳这个字段——把"情感承诺"显式化，使审计能判断"回收是否兑现情感意图"而非仅"是否提到"。`introducedIn`/`payoffChapter` 用 `Ch.1`/`Ch.3` 字符串格式，简单可读，但 LinYi 若需排序/查询应改为数字章号。

- **ContinuityIssue 结构**（`lib/types.ts`）：`category/severity/issue/evidence/suggestedFix` 五字段是连续性问题的最小完备结构。`evidence` 字段强制审计者提供证据（而非主观断言），`suggestedFix` 使问题可操作。LinYi 的连续性审计输出应直接照搬这个结构，配合 InkOS 的 37 维 category 枚举可形成强表达力。

- **retry 错误模式分类**（`lib/agent-retry.ts:28-80`）：`NON_RETRYABLE_PATTERNS` 与 `RETRYABLE_PATTERNS` 的双列表 + 默认 retryable 的策略，是 LLM 调用健壮性的实用设计。LinYi 的 LLM 调用层应直接挪用——避免对"insufficient credits"这类不可恢复错误浪费重试配额。`getRetryPolicyForAgent`（行 18-22）支持按 agent 定制 policy，Chapter Architect 有独立 policy。

- **fallback 全覆盖 + 三语支持**（`lib/agent-fallbacks.ts`）：每个 agent 的 fallback 不是空壳而是结构完整的占位内容，使流水线在 LLM 不可用时仍能产出可读（虽不优秀）的完整稿件。`AGENT_FALLBACK_RECOVERY_MESSAGE`（行 4-5）统一标注"此 agent 返回不完整 JSON，已用 fallback 继续"——透明告知读者降级发生。LinYi 应采纳这个"降级透明化"原则。

- **JSON schema 驱动 agent 输出**（`lib/prompts.ts:57-107` 的 `SCHEMAS` 字典）：每个 agent 有独立 schema，prompt 末尾强制"Respond with ONLY valid JSON matching this schema (no markdown fences)"。`COMPACT_JSON_RULES`（行 50-51）"Return valid JSON only. No markdown, no explanations, no comments. Use short sentences for string values."——这种强约束显著降低 JSON 解析失败率。

## 需要改造才能借鉴的部分

- **9-Agent 固定顺序流水线**：NovelPilot 是严格的 9 步顺序执行，无分支无循环。LinYi 长篇写作需要"每章循环 + 弧末后处理 + 重写队列"，不能照搬线性流水线。但"concept → character → world → plot → outline → drafting → editor → continuity"的阶段划分可借鉴为"全书初始化阶段"的子步骤。

- **StoryBible 单一真源容器**：NovelPilot 把所有状态塞进一个 `StoryBible` 对象，简单但对长篇不友好（每章更新整个 bible 序列化成本高）。LinYi 应参考 InkOS 的 RuntimeStateDelta 增量模型，而非全量 bible。

- **resetFromAgent 的回滚粒度**：按 agent index 回滚是"粗粒度"——回滚 drafting 会丢掉已写章节。LinYi 应设计更细粒度的回滚（如按 chapter + agent 双维度），避免一次编辑失败丢掉整批已写内容。

- **fallback 内容的题材适配**：NovelPilot 的 fallback 是通用占位（"A protagonist follows a hidden truth"），与用户实际题材无关。LinYi 的 fallback 应尽量从已完成的早期 agent 输出中提取题材信息，使降级内容更贴近用户意图。

## 潜在风险

- **9-Agent 顺序执行的累积延迟**：每个 agent 一次 LLM 调用，9 个 agent 串行可能数分钟。NovelPilot 似乎是短篇取向（drafting agent 一次写完所有章节）。LinYi 长篇必须改为"初始化 9 步 + 每章循环"模式，否则延迟不可接受。

- **fallback 隐藏质量问题**：fallback 输出是占位内容，若用户不察 `AGENT_FALLBACK_RECOVERY_MESSAGE` 可能误以为高质量产出。LinYi 应在最终稿件元数据里记录哪些 agent 用了 fallback，并允许用户触发"重跑降级 agent"。

- **NON_RETRYABLE_PATTERNS 的误判**：错误消息匹配是字符串 `includes`（`agent-retry.ts:73`），可能误判。如"504"会匹配到包含"504"的任何错误消息。LinYi 应考虑更精确的匹配（HTTP status code 字段而非消息子串）。

- **JSON schema 的 prompt 嵌入成本**：每个 agent prompt 末尾嵌入完整 schema 字符串（`prompts.ts:223-229`），长 schema 显著增加 token 消耗。LinYi 可考虑"schema 提取 + 工具调用"模式（如 OpenAI function calling）替代 prompt 嵌入。

- **StoryBible 的 chapters 字段膨胀**：所有章节正文都存在 `StoryBible.chapters`（`lib/types.ts`），长篇时这个对象会膨胀到无法整体序列化。LinYi 必须分章存储，bible 只持有章号索引与摘要。

## 架构对照信息

| 维度 | NovelPilot | LinYi 目标 |
|---|---|---|
| 编排 | 9-Agent 固定顺序流水线 | 待定（初始化阶段可借鉴，写作需循环） |
| 真源容器 | StoryBible 单一对象（全量） | 待定（应改增量，参考 InkOS delta） |
| 伏笔追踪 | ForeshadowingItem（含 emotionalPurpose） | 待定（应直接采纳） |
| 连续性审计 | ContinuityIssue 五字段 + category/severity | 待定（结构可照搬，category 扩展到 37 维） |
| 失败防线 | retry 分类 + fallback 全覆盖 + resetFromAgent | 待定（retry 与 fallback 应直接挪用） |
| 输出契约 | JSON schema 驱动 + COMPACT_JSON_RULES | 待定（schema 驱动可借鉴） |
| 上下文压缩 | agent-context.ts 的 truncate + compact* 函数族 | 待定（截断思路可借鉴） |

## 借鉴点映射

| LinYi 模块 | 对应 NovelPilot 设计 | 文件路径 |
|---|---|---|
| 伏笔追踪 | ForeshadowingItem（emotionalPurpose） | `lib/types.ts` |
| 连续性审计 | ContinuityIssue（category/severity/evidence/suggestedFix） | `lib/types.ts` |
| 真源容器 | StoryBible 结构（需改增量） | `lib/types.ts` |
| LLM 调用健壮性 | retry 错误模式分类 + RetryPolicy | `lib/agent-retry.ts:28-80` |
| 降级输出 | buildFallbackAgentOutput 全覆盖 + 三语 | `lib/agent-fallbacks.ts:259-285` |
| Agent 定义 | AGENT_DEFINITIONS + mergeAgentOutput + resetFromAgent | `lib/agents.ts` |
| 输出契约 | SCHEMAS 字典 + COMPACT_JSON_RULES | `lib/prompts.ts:50-107` |
| 章级上下文 | buildDraftingContext（prior summaries + ending excerpt） | `lib/agent-context.ts:358-409` |
| 章节提示词 | buildChapterDraftPrompt（length hint + role hint） | `lib/prompts.ts:117-170` |
| 失败回滚 | resetFromAgent 按 index 回退后续 agent | `lib/agents.ts` |
