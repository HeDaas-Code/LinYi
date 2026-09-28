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
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.378Z"
fingerprint: 58f6bbe6d6e7f20311dcd2d6b599168c726ef2395e5fac4bf3d183c49cd6a4c1
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
