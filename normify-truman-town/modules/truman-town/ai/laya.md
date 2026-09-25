---
uid: b7d24e19
id: truman-town.ai.laya
parent: truman-town.ai
tags: [ai, laya, semantic, optional]
name: {zh: "语义判断", en: "Semantic Judgement"}
description:
  zh: >
      接入本地 LAYA 结构化判断服务，把处境紧迫度交给语义模型而非固定阈值。它是压力分的语义分量（15%），不是决定者：服务不可用时静默回退，默认关闭。
  en: >
      Optional LAYA structured-judgement client contributing a semantic share of the pressure score; never the decider, silent fallback, off by default.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T05:42:58Z"
fingerprint: 55cce1d6d200ea3934410b860b36620cb93778e101f3ddc866c82a8886dcd495
source:
  - path: "src/ai/laya.js"
apis:
  - protocol: rpc
    path: "ai.laya.judge"
    description:
      zh: >
          发起一次 LAYA 结构化判断，按状态键缓存。
      en: >
          Issues one LAYA judgement with state-key caching.
  - protocol: rpc
    path: "ai.laya.survivalUrgency"
    description:
      zh: >
          把居民的饥饿与储备处境交给语义模型，返回紧迫度 0..1。
      en: >
          Returns a 0..1 urgency for a resident state.
  - protocol: rpc
    path: "ai.laya.scoreExpectation"
    description:
      zh: >
          从 score 型的概率分布聚合出期望档位。
      en: >
          Aggregates an expected score from probabilities.
  - protocol: rpc
    path: "ai.laya.getStats"
    description:
      zh: >
          调用与命中与失败与延迟快照。
      en: >
          Call, hit, failure and latency snapshot.
deps:
  - kind: reference
    to: truman-town.infra.config
    label: {zh: "读取服务地址", en: "Reads endpoint config"}
---

## 定位

LAYA 是本地结构化判断服务，只输出结构化判断。本模块把它接成**可选通路**：默认关闭，开启后其输出只作为压力分的语义分量参与打分。

## 为什么不是决定者

用户明确要求居民必须是涌现的多智能体决策者。若把紧迫度当成门或决定者，就等于代码替居民决定——这正是本项目已复发七次的反模式。因此这里的输出权重仅 15%，且永不清零任何候选。

## 实测

- noul 型不可用：连五天没吃且断粮都判 crisis=false，与同次调用的 score 自相矛盾。只用 score。
- score 型不返回 value 字段，只给 probabilities，必须取期望值。早期只读 value 得 undefined，曾据此误判 LAYA 不可用。修正后区分度正确：温饱 0.412 / 极饿断粮 0.532 / 五天未食 0.757。
- 性能：全量预取 20 人 30 tick 耗 78s。改为只对已达进食阈值者调用并分桶后，calls 539 降到 27、命中率 84%、墙钟 3.85s。
