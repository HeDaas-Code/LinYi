---
uid: c4a1d7e2
id: truman-town.agent.decision.candidates
parent: truman-town.agent.decision
name: {zh: "候选规划器", en: "Candidate Planner"}
description:
  zh: >
      按居民当前状态（背包材料、就业、识字、同伴、市场空位）生成可达行动候选，恒定包含生存骨架，再追加规则准入的动态行动（craft/build/write/work/trade/socialize/court/accept/expedition/found）；不可行时给出拒绝理由。
  en: >
      Generates reachable action candidates from agent state, always including the survival spine, then appends rule-gated dynamic actions (craft/build/write/work/trade/socialize/court/accept/expedition/found); rejects with a reason when infeasible.
revision: 45f6c8b7b8ba210fcd94506b2097c8e601dd1382
updated_at: "2026-09-26T01:46:05.912Z"
fingerprint: 6761af8c28ca671d3c910ed714b75a14db614d8d852dbc6add39b42ac079c74b
source:
  - path: "src/agent/decision/candidates.js"
apis:
  - protocol: rpc
    path: "agent.decision.candidates.plan"
    description:
      zh: >
          生成候选列表。found 的准入同时取决于 canFound（够本）与 marketRoom（市场有空位）。
      en: >
          Builds the candidate list. found admission requires both canFound (capital) and marketRoom (open slot).
  - protocol: rpc
    path: "agent.decision.candidates.actions"
    description:
      zh: >
          返回当前可用的行动名列表。
      en: >
          Returns the currently available action names.
  - protocol: rpc
    path: "agent.decision.candidates.rules"
    description:
      zh: >
          返回行动准入规则表。
      en: >
          Returns the action admission rule table.
  - protocol: rpc
    path: "agent.decision.candidates.baseScores"
    description:
      zh: >
          返回各行动的基础分（生存骨架 0.2~0.3，动态行动 0.6~1.0）。
      en: >
          Returns per-action base scores (survival spine 0.2-0.3, dynamic 0.6-1.0).
deps:
  - kind: call
    to: truman-town.agent.anticipation.pool.store
    label: {zh: "候选写入预想池", en: "Candidates written to pool"}
---

D0 行动空间地基：把「居民能做什么」从出生时固定改为逐 tick 按状态推导。
