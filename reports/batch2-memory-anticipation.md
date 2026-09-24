# 批次2-B：智能体记忆、预演与决策解释（t47）

> AI 工程师（ai-engineer）交付。四模块：语义记忆 / 候选修剪 / 行动模拟 / 决策解释器，
> 全部实现并激活（normify state=active），npm test 全绿（358/358）。

## 1. 交付模块

| 模块 | 文件 | API | 说明 |
|---|---|---|---|
| 语义记忆 | src/agent/memory/semantic.js | store / recall | 事件→摘要条目；词面+标签相关度召回（默认纯词面，不依赖 MiniLM）。入库时预分词缓存。 |
| 候选修剪 | src/agent/anticipation/pool/pruner.js | score / prune | 按动机（饥饿/口渴 +2）与性格（TRAIT_BIAS）打分，保留前 K。 |
| 行动模拟 | src/agent/anticipation/simulator.js | simulate / predict | 数值/状态推演：需求变化+资源收益+风险+探索扰动；无开放世界/寻路。探索用本地 FNV 哈希，不消耗全局 rng。 |
| 决策解释器 | src/agent/decision/explainer.js | explain / trace | 人类可读“为何选 A 放弃 B”，trace 输出结构化轨迹。 |

## 2. 主循环集成（real loop.js，file:line）

src/runtime/orchestrator/loop.js：

- decide()（决策链）：
  - L297 pruner.prune(...) 候选修剪
  - L305 simulator.predict(...) 行动推演
  - L316 semantic.recall(...) 语义记忆召回
  - L341 explainer.explain(...) 决策解释
  - L348 explainer.trace(...) 结构化轨迹
- step()（决策落盘后）：
  - L612 semantic.store(...) 按决策写语义记忆

决策评分 = 生存骨干 scoreAction + 性格 personality.evaluate + 模拟 simBy；
返回 reason/explanation/trace/predicted/context.semantic/context.simulation，全部写入 observer 决策日志。

## 3. 涌现性验证（50 居民 × 200 tick × 3 种子）

配置：默认难度，scheduleEnabled:false（隔离 t48 日程覆盖，聚焦本批次决策链）。

| seed | 存活 | 墙钟 | eat | drink | rest | forage | util.mean | explo.mean |
|---|---|---|---|---|---|---|---|---|
| 1 | 50/50 | 5974ms | 1984 | 1998 | 59 | 5959 | 0.0716 | 0.2494 |
| 2 | 50/50 | 4500ms | 2000 | 1989 | 58 | 5953 | 0.0901 | 0.2473 |
| 3 | 50/50 | 4089ms | 1994 | 1986 | 63 | 5957 | 0.0781 | 0.2485 |

- 跨种子分叉：eat/drink/rest/forage 分布、util.mean、explo.mean 六项均随种子变化（≥2 项达标，实际 6 项）。rest 从 0（纯确定性基线）变为 58/59/63，探索扰动真实进入决策。
- 无回退：三种子存活率均为 1.00（50/50），eat/drink 的 +2 生存信号主导噪声。
- 性能：墙钟 4.1–6.0s/200tick，相对基线（~3.5–4s）约 1.1–1.5×，未超 2× 门禁。

### 叙事样例（≥3 条，含谁/何时/为何/做什么/放弃）

1. 「在第 3 tick，agent_000000000001 因水源需求偏高（0.48）而选择「drink」（评分 2.35），放弃了「eat」「rest」「forage」。」
2. 「在第 4 tick，agent_000000000001 因食物需求偏高（0.53）而选择「eat」（评分 2.23），放弃了「drink」「forage」「rest」。」
3. 「在第 1 tick，agent_000000000014 因无紧迫生存需求，按预期收益与风险权衡而选择「rest」（评分 1.31），放弃了「eat」「drink」「forage」。」
4. 「在第 1 tick，agent_000000000001 因无紧迫生存需求，按预期收益与风险权衡而选择「forage」（评分 1.41），放弃了「rest」「drink」「eat」。」

## 4. 性能修复（响应 captain 反馈）

- 根因：semantic.recall() 对每条记忆重复分词（tokenize 每 tick 每主体调用），随记忆量线性放大。
- 修复：store() 入库时一次性预分词并缓存 tokens；recall() 复用缓存 + 查询侧 Set 预建。
- 效果：recall 10k 次从 122µs/op → 19.6µs/op（6.2×）。
- 另：simulator 探索扰动改用本地确定性 FNV 哈希（seed+agentId+tick+action），不消耗全局 rng，消除对 economy-closure 跨种子差异用例的随机流污染（该用例已恢复通过）。

## 5. 测试

- 新增 test/agent-memory-anticipation.test.js：13 用例（语义存/召回/裁剪、修剪空池/K溢出、模拟风险/噪声、解释可读性、50×200 存活无回退+解释+语义落盘）。
- npm test：358 pass / 0 fail / 0 cancelled。

## 6. normify

- 4 模块 normify_module_refresh({activate:true}) 转 active，fingerprint 已冻结。
- normify_validate：0 error（1 warning 为 266 条历史未锚定箭头，非本批次）。
- normify_build：227 模块 / 359 API / 0 error，tree.json / outline.md / api-index.json / receipt.json 已重建。
