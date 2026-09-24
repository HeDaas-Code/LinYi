# LAYA System One 评估：对本项目是否有帮助

- 服务：`POST http://127.0.0.1:7780/v1/systemone`（本地，Bearer 鉴权）
- 凭据：已写入 git-ignored 的 `.env`（`LAYA_BASE_URL` / `LAYA_KEY`，mode 600），本文件不记录密钥
- 结论：**有条件的"有帮助"**——其 `noul` / `score` 题型是可靠且判别力强的辅助判断信号；`choice` 题型目前**不足以**让居民选行动。

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

### 2.1 noul（是/否）——判别力强
问「该居民是否处于生命危险中？」：

| state | noul | confidence |
|---|---|---|
| 濒死（五天没吃，快饿死，水只剩一点） | **0.8793** | 0.8793 |
| 温饱（刚吃饱喝足） | **0.0010** | 0.9990 |
| 受伤（腿被砸断，流很多血） | 0.0042 | 0.9958 |

濒死 vs 温饱相差约 **880 倍**。措辞良好的 noul 是可信的生存状态判据。

### 2.2 score（分级）——序列单调合理
问「眼前生存压力有多大？」，等级 `[完全没有压力, 有些担心, 明显紧张, 非常紧迫, 生死攸关]`：

| state | score | 主要概率 |
|---|---|---|
| 濒死 | **2.7193** | 生死攸关 0.410 / 明显紧张 0.270 |
| 受伤 | **2.6243** | 生死攸关 0.398 / 明显紧张 0.255 |
| 温饱 | **1.1333** | 有些担心 0.623 |

### 2.3 choice（多选）——不足以驱动行动
同一居民、11 个候选行动（eat/drink/rest/forage/craft/build/work/trade/socialize/court/write）：

- 濒死（文本 state）：`write=0.280 drink=0.276 eat=0.227 rest=0.152` —— **将死之人首选"写书"**，行为上不成立。
- 濒死（裸 JSON state `{hunger:0.95,...}`）与温饱（`{hunger:0.05,...}`）几乎同一分布，且 **4 次重复完全一致** → 它**不 grounding 于裸 JSON 键值**，只响应自然语言。
- 去掉"水也只剩最后一点"这一小句后，同一濒死 state 从 write 主导跳变为 `eat=0.931`（conf 0.847）→ 措辞敏感、抖动大。

### 2.4 工程特性
- **确定性**：同输入多次调用逐位一致（choice 两次同为 `write=0.280 drink=0.276 eat=0.227 rest=0.152`）。
- **延迟**：单次 173–663ms（样本中位约 360ms）。
- **成本**：`input_tokens` 约 33–187，**`output_tokens` 恒为 0**（纯判别，无生成）。
- 中文可用；多语言模型 `laya-rl-agent`。

---

## 3. 对项目的适用性判断

**适合用作辅助判断信号，不适合作为行动选择器。**

| 用途 | 可用性 | 依据 |
|---|---|---|
| `noul` 生存危机判定 | **推荐** | 濒死/温饱差 880 倍，可作候选打分的前置门 |
| `score` 紧迫度分级 | **推荐** | 三处境单调有序（2.72 / 2.62 / 1.13） |
| `choice` 直接选行动 | **不推荐** | 濒死首选"写书"；对裸 JSON 不敏感 |
| 替代聊天 LLM 生成思考文本 | 不适用 | 该接口不生成文本（output_tokens=0） |

### 关键约束（不解决就不能上主循环）
1. **延迟 × 规模**：50 居民 × 200 tick = 10,000 次调用 × ~360ms ≈ **1 小时/局**，与当前 5.6s 的主循环相差 3 个数量级。
   —— 但**输出确定性** ⇒ 可按**量化后的 state 分桶缓存**，把调用量压到状态桶数量级。
2. **必须喂自然语言 state**：裸 JSON 键值几乎不被读取（不同处境分布近似相同）。
3. **choice 不可单独定夺**：只宜作为已有多因子打分的一个加权项，且需独立验证。

---

## 4. 建议的接入方式（若采纳）

- **最低风险**：仅用 `noul`/`score` 作**辅助调制项**接入 `pruner.score`（例如"是否处于生存危机"作为 survivalGate 的语义确认），并加**分桶缓存**；保留现有确定性打分为主干。
- **不建议**：把 `choice` 作为行动决定者直接替换 `candidates` + `pruner`；也不建议在未解决延迟/缓存前进入 200 tick 主循环。
- **前置验证**：接主循环前先做小规模（如 10 居民 × 50 tick）端到端，测量实际调用次数、缓存命中率与总耗时。

---

## 5. 复现方式

```bash
cd /home/hedass/文档/项目/LinYi
node --env-file=.env <探测脚本>   # 探针脚本为临时文件，未入库
```

探测要点：GET `/v1/systemone` 返回 405（仅 POST）；`/openapi.json`、`/docs` 均 404，schema 需由 422 校验错误与前端的官方范例反推——**范例在 `/assets/index-*.js` 内**（搜索 `criteria` 或 `churn_risk` 定位）。
