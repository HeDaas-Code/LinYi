# LAYA System One 评估：对本项目是否有帮助

- 服务：`POST http://127.0.0.1:7780/v1/systemone`（本地，Bearer 鉴权）
- 凭据：已写入 git-ignored 的 `.env`（`LAYA_BASE_URL` / `LAYA_KEY`，mode 600），本文件不记录密钥
- 结论：**有条件的"有帮助"**——`score` 题型在**有描述**且**取概率期望值**的前提下判别力良好，适合作为压力分的语义分量；`noul` 题型实测**不可用**（自相矛盾）；`choice` 题型在**有描述**时可用，但延迟过高，不适合作为逐 tick 行动选择器。

> **修订说明（2026-09，本轮实测）**：本文件初版有两处结论**已被证伪**，见第 6 节。
> 初版的 `choice`「不足以让居民选行动」与 360ms 延迟两项均已更正。

---

## 1. 它是什么

LAYA SERVER 暴露一个**结构化判断**接口（非文本生成）。请求契约（取自前端内置官方范例）：

```json
{
  "state": { "message": "I was charged twice and need a refund today." },
  "questions": {
    "intent": { "type": "choice", "instructions": "What does the customer want?",
                "criteria": { "refund": "money returned", "technical_help": "a technical problem" } },
    "urgent":  { "type": "noul", "instructions": "Does the customer express urgency?" },
    "frustration": { "type": "score", "instructions": "How frustrated is the customer?",
                     "criteria": ["calm", "concerned", "very angry"] }
  },
  "model": "auto"
}
```

- `questions` 是 **dict**；每题是判别联合，tag 为 `type`，取值 `noul`（是/否）、`score`（分级）、`choice`（多选）。
- `criteria`：choice 为 `{label: 描述}` 字典；score 为**从低到高的等级描述数组**；noul 无 criteria。
- `model` 可用值：`auto` / `english` / `multilingual` / `typed-decisions`。
  **实测 `typed-decisions` 未安装**：`{"code":"MODEL_NOT_AVAILABLE","message":"Only the multilingual model is installed"}`。
- 响应形如：`{ model: "laya-rl-agent", answers: { <id>: {...} }, usage: {input_tokens, output_tokens}, routing: {model: "multilingual", repo: "/opt/models/multilingual"} }`。

---

## 2. 实测能力

### 2.1 noul（是/否）——**实测不可用（初版结论已推翻）**
初版曾测得「濒死 0.8793 vs 温饱 0.0010，相差 880 倍」。**本轮复测无法重现**，
且出现**同一次调用内部自相矛盾**：

问「Is this person in immediate danger of dying if they do nothing right now?」，
同一请求内的 `score` 题返回 `raw=2.96`（接近"生死攸关"档），而 `noul` 题对
**全部 4 个处境（含「五天没吃且断粮」）均判 `crisis=false`**。

编码路径已核查：`crisisAns.choice === true || choice === 'true' || value === true`
——不是取值方式的问题，是判断本身不成立。**故本项目不采用 noul。**

### 2.2 score（分级）——**必须取概率期望值**（编码要点）

**关键事实：score 型不返回 `value` 或 `score` 字段，只返回 `probabilities`**
（键为档位索引 `"0"`..`"4"` 的字符串）。初版只读 `value`/`score`，两者皆 undefined
→ 得到 `raw ≈ 0` 的恒定值，据此误判「LAYA 对处境不敏感」。**这是取值缺陷，不是服务缺陷。**

正确聚合方式：期望档位 `E = Σ i·p_i / Σ p_i`（已实现在 `src/ai/laya.js` 的
`scoreExpectation()`；若上游改为返回显式 `value`，则该值优先）。

修正后的实测（消息带唯一标识避免缓存串扰）：

| 处境 | raw | urgency = raw/4 |
|---|---|---|
| 温饱 | 1.648 | 0.412 |
| 有点饿 | 1.313 | 0.328 |
| 极饿但有粮 | 1.146 | 0.286 |
| 极饿且断粮 | 2.128 | 0.532 |
| **五天未食** | **3.026** | **0.757** |

方向正确：「五天未食」显著高于「温饱」；「极饿但有粮」略低是合理的（有存粮不构成绝境）。

另附一次**未做期望值聚合**的对照，可看到概率分布确实随处境右移（但初版读不到 value 时看不出）：

| 处境 | probabilities（档 0..4） | 众数档 |
|---|---|---|
| fed | .070 / **.489** / .382 / .041 / .019 | 1 |
| slightly-hungry | .104 / **.724** / .143 / .019 / .011 | 1 |
| very-hungry-with-food | .066 / **.581** / .259 / .066 / .028 | 1 |
| starving-no-food | .007 / .216 / **.549** / .177 / .052 | 2 |

### 2.3 choice（多选）——**有描述时可用**（初版结论已推翻）
初版记录「濒死首选写书」，据此判定 choice 不可用。**该结论错误**，根因是
**criteria 构造缺陷**：初版把行动名（eat/drink/write…）直接当作 `criteria` 的 label
却**未给任何描述**。choice 型需要 `{label: 描述}` 字典才能判别。

用**带描述**的 criteria 重测，结果高度集中且方向正确：

| 处境 | 首选 | confidence |
|---|---|---|
| 温饱 | `rest`（rest=0.925） | 0.846 |
| 极饿但有粮 | `eat`（eat=0.9997） | 0.999 |
| 极饿且断粮 | `eat` | 0.998 |

——「将死之人写书」是可复现的 **criteria 构造错误**，与 LAYA 能力无关。
（本项目最终仍**未**把 choice 用作行动选择器，原因是延迟而非判别力，见 2.4。）

### 2.4 工程特性
- **确定性**：同输入多次调用逐位一致，故可按状态键缓存（本轮实测命中率 84%）。
- **延迟**：单次 **77–203ms**（初版记录的 360ms 已过时）。但**并发下显著劣化**：
  20 路并发时均延迟涨到约 2.8s（见第 6 节的性能实测）。
- **成本**：`input_tokens` 约 33–187，**`output_tokens` 恒为 0**（纯判别，无生成）。
- 中文可用；多语言模型 `laya-rl-agent`。

---

## 3. 对项目的适用性判断

**适合用作辅助判断信号，不适合作为行动选择器。**

| 用途 | 可用性 | 依据 |
|---|---|---|
| `noul` 生存危机判定 | **不采用** | 4 个处境（含五天断粮）全判 crisis=false，与同次 score 矛盾 |
| `score` 紧迫度分级 | **采用（需取概率期望值）** | 五天未食 0.757 > 断粮 0.532 > 温饱 0.412，方向正确 |
| `choice` 直接选行动 | **判别力可用，但延迟过高** | 带描述 criteria 时方向正确（饿→eat 0.9997） |
| 替代聊天 LLM 生成思考文本 | 不适用 | 该接口不生成文本（output_tokens=0） |

**本项目最终采纳**：只把 `score` 的期望值接成压力分的语义分量（15%），默认关闭。
见 `src/ai/laya.js` 与结构模块 `truman-town.ai.laya`。

### 关键约束（不解决就不能上主循环）
1. **延迟 × 规模（决定性的约束）**：实测 20 人 30 tick 全量预取 = **539 次调用、墙钟 78s**
   （未开启同规模仅 0.45s，**慢 175 倍**）；并发 20 路时单次延迟由 200ms 涨到 ~2.8s。
   —— 缓解手段（已实装并实测）：`score` 输出确定 ⇒ 按**分桶后的状态键缓存**，
   且**只对已达进食阈值者调用**。效果：calls 539→27、命中率 84%、墙钟 3.85s。
2. **必须喂自然语言 state**：裸 JSON 键值几乎不被读取（不同处境分布近似相同）。
3. **score 必须取概率期望值**：它不返回 `value`；只读 `value` 会得到恒定值并误判为"无区分度"。
4. **noul 不可用作门**：若把它当生存门，会因恒 false 而静默失效。

---

## 4. 建议的接入方式（若采纳）

**已实装的接入方式**（`src/ai/laya.js` + `loop.js` 的 `prefetchLayaUrgency`）：

- 只用 `score`，取概率期望值，归一化到 0..1；
- 只作**压力分的语义分量（15%）**，且压力本身只影响打分、**永不清零任何候选**——
  决定权始终在居民手里（这是用户对本项目最硬的要求）；
- 服务不可用 / 超时（5s）时静默回退为"无语义分量"，决策链完全不受影响；
- 默认关闭（`layaSemanticEnabled: false`），需要显式开启；
- 按分桶状态键缓存 + 每 tick 调用预算（`layaMaxAgents`）。

**明确不采用**：把 `choice` 作为行动决定者——不是判别力问题，而是延迟比确定性打分高 3 个数量级。

---

## 5. 复现方式

```bash
cd /home/hedass/文档/项目/LinYi
node --env-file=.env <探测脚本>   # 探针脚本为临时文件，未入库
```

探测要点：GET `/v1/systemone` 返回 405（仅 POST）；`/openapi.json`、`/docs` 均 404，schema 需由 422 校验错误与前端的官方范例反推——**范例在 `/assets/index-*.js` 内**（搜索 `criteria` 或 `churn_risk` 定位）。

---

## 6. 修订记录：本文件被证伪的两处结论

本节保留原始记录，供后续会话避免重走弯路。

| # | 初版结论 | 复测事实 | 根因 | 处置 |
|---|---|---|---|---|
| 1 | `choice`「不足以让居民选行动」——濒死首选"写书" | 带描述 criteria 时**方向完全正确**（极饿→`eat` 0.9997；温饱→`rest` 0.925） | **我的 criteria 构造缺陷**：把行动名当 label 却未给描述。choice 型需要 `{label: 描述}` 字典 | 结论推翻；仍不采用，但理由是**延迟**不是判别力 |
| 2 | 单次延迟中位约 **360ms** | 77–203ms（并发 20 路时约 2.8s） | 早期样本量小且未区分串行/并发 | 已更正 |
| 3 | `noul`「判别力强，濒死/温饱差 880 倍」 | 4 个处境含五天断粮**全判 crisis=false**，与同次调用的 score 自相矛盾 | 服务侧判断不成立（已核查非取值编码问题） | 结论推翻，**不采用 noul** |
| 4 | `score`「推荐」但未说明取值方式 | `score` **不返回 value/score 字段**，只有 probabilities | 只读 value/score → undefined → `raw` 恒 0，曾据此误判「对处境不敏感」 | 改为期望值聚合，区分度恢复 |

### 性能实测（本轮，决定接入形态的关键数据）

| 配置 | 调用数 | 命中数 | 墙钟 | 缓存键数 |
|---|---|---|---|---|
| 全量预取（20 人 30 tick） | 539 | 114 | **77,988ms** | 539 |
| 只对达阈值者 + 分桶（同规模） | 27 | 143 | **3,852ms** | 7 |

未开启 LAYA 的同规模基线为 **446ms**。仿真结果（`craft`/`built`/`trades`/`posts`）在两种配置下完全一致
——说明语义分量只调制打分排序，**不改变行为结构**，符合"辅助项而非决定者"的设计意图。
