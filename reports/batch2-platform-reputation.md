# 批次2-E：社交平台与声誉（帖子 / 信息流 / 声誉系统）

- 提交：`4788222`（代码） + 结构件提交（tree.json / outline.md / api-index.json / receipt.json + 模块 .md）
- 日期：2026-09-24
- 覆盖模块：`social.platform.posts`、`social.platform.feeds`、`social.reputation`

## 实现内容

新增三个真实机制模块并接入主循环：

1. **social.platform.posts**（`src/social/platform/posts.js`）：`publish / reply / react`，帖子/回复以 graph store 持久化，发帖/回复写入作者 `agent.memory.episodic` 情景记忆。内容由处境模板+状态拼装，**不调用真实大模型**。
2. **social.platform.feeds**（`src/social/platform/feeds.js`）：`generate / rank`，按时效 + 社区亲和（依赖 `social.graph.community`）+ 关系边权重 + 作者声誉 + 互动热度排序信息流（谁看到什么）。
3. **social.reputation**（`src/social/reputation.js`）：`update / query`，声誉 ∈ [0,100] 起点 50，分 `trusted(≥70) / neutral / distrusted(<30)` 三档，随社交与经济行为增减。

声誉数据源（全部真实接线）：履约购买/交付商品（+）、违约破产（−）、帖子首次被回复（+）、被点赞/踩（±）。声誉**被读取**并反馈到三处决策/经济路径（见下）。

## ① 接入真实（主循环真实调用点 文件:行）

| 调用点 | 位置 |
| --- | --- |
| 平台随机源自有流播种（不扰动全局经济 RNG） | `_stage2.js:145` |
| 处境驱动的发帖 `posts.publish`（饥饿/患病/破产/贫困/闲聊） | `_stage2.js:928/974` |
| 回复 `posts.reply` + 首次被回复声誉 +`replyGain` | `_stage2.js:994/1000` |
| 点赞/踩 `posts.react` + 声誉 ± | `_stage2.js:1012/1017` |
| 信息流 `feeds.generate`（按社区/关系/声誉排序，节流） | `_stage2.js:1025` |
| 经济侧声誉：买方/卖方成交 | `_stage2.js:547/551` |
| 经济侧声誉：违约破产 | `_stage2.js:609` |
| 声誉→信贷利率（高声誉更低利率） | `_stage2.js:640/919` |
| 声誉→治疗分诊（高声誉优先获得名额） | `_stage2.js:864` |
| `tick()` 驱动 `runPlatform` | `_stage2.js:1051` |
| `summary()` 输出声誉分布 | `_stage2.js:1112` |

帖子内容严格由真实处境驱动：`situationOf()` 读取 `survival.needs.meter`（饥饿）、`survival.health.disease`（患病）、`economy.industry.business`（破产创始人）、账户余额（贫困）后拼装模板文案，而非无条件定时发帖。

## ② 跨种子分叉（50 居民 × 200 tick × 3 种子）

| 字段 | seed 1 | seed 2 | seed 3 | 分叉 |
| --- | --- | --- | --- | --- |
| 帖子数 postCount | 853 | 825 | 867 | ✅ 3 值 |
| 回复数 replyCount | 4993 | 4983 | 4953 | ✅ 3 值 |
| 点赞/踩 reactCount | 2602 | 2579 | 2523 | ✅ 3 值 |
| 信息流排序 feedSignature（前 4） | 0002,0002,0002,0002 | 0002,0001,0002,0229 | 0001,0001,0002,0019 | ✅ 全不同 |
| 声誉分布 rep.mean | 57.31 | 58.18 | 58.32 | ✅ 3 值 |
| 存活率 | 50/50 | 50/50 | 50/50 | 1.00 |

帖子数/回复数/信息流排序/声誉分布 **5 个字段全部跨种子分叉**（硬指标要求 ≥2，超额满足）。

## ③ 可叙事历史（≥3 条具体帖子 + 作者处境 + 声誉变化）

1. **破产抱怨**（seed 1）：`agent_000000000002`（企业创始人，企业已 closed）在 tick 104 发帖「我的企业破产了，真是糟透了。」，收到 8 条回复；其声誉在 tick 98 因违约破产 **−30（100→70）**。
2. **贫困求职**（seed 1）：`agent_000000000229` 在 tick 11 发帖「手头有点紧，想找份工作。」，收到 5 条回复；帖子首次被回复使作者声誉 **+0.5**。
3. **贫困求职**（seed 1）：`agent_000000000229` 在 tick 2 发帖「手头有点紧，想找份工作。」，收到 7 条回复（其处境为账户余额 < 100）。

三类处境文案均已接线：患病「我感觉不舒服，需要医疗帮助。」、饥饿「好饿，谁能分我点食物？」、破产「我的企业破产了…」、贫困「手头有点紧，想找份工作。」。

## ④ 不得回归

- 默认参数 50 居民 × 200 tick × 3 种子存活率 **1.00**（50/50 × 3）。
- 全量 `npm test`：**380/380 通过**（0 失败）。

## 声誉真实反馈到行为（关键，附有/无反馈对照）

声誉并非只写不读，接入三处：

1. **信贷利率（经济路径，全循环可观测）**：`runFiscal` 逐笔计息时按借款人声誉调利率（高声誉 100 → 0.5×，低声誉 0 → 1.5×）。同种子对照：`reputationCreditEnabled=true` 累计利息 **157.30**，`=false` 累计利息 **297** —— 高声誉企业创始人享受近半利率减免，行为差异明确。
2. **治疗分诊（决策路径）**：`runHealth` 用 `rankTriageByReputation` 让高声誉者优先获得稀缺治疗名额。单元测试给出有/无反馈对照：同等严重度下，无反馈保持输入序 `[low, high]`，有反馈重排为 `[high, low]`。
3. **信息流排序（内容路径）**：`feeds.rank` 读取作者声誉作为排序因子，高声誉作者帖子排前（单元测试断言）。

## 测试

新增 `test/social-platform-reputation.test.js` 6 项：发帖/回复/反应、声誉增减与查询、信息流声誉排序、治疗分诊反馈对照、信贷利率反馈对照、50×200×3 存活+跨种子分叉+处境帖子。

## Normify

- 3 模块已 activate：`social.platform.posts`（`5f4e70a1…`）、`social.platform.feeds`（`04816c0f…`）、`social.reputation`（`9ee9e9e3…`）。
- `normify_validate`：**0 error**（仅 1 条项目既有 dep/unanchored 警告）。
- `normify_build`：227 模块 / planned 84（t50 激活 3 个）。
- `infra.config` 模块指纹已同步（新增 t50 参数）。
