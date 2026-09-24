---
uid: c4a1d7e2
id: truman-town.agent.decision.candidates
parent: truman-town.agent.decision
name: {zh: "候选规划器", en: "Candidate Planner"}
description:
  zh: >
      按居民当前状态（背包材料、就业、识字、同伴）生成可达行动候选，恒定包含生存骨架（eat/drink/rest/forage），再追加规则准入的动态行动（craft/build/write/work/trade/socialize/court）；不可行时给出拒绝理由。
      
  en: >
      Generates reachable action candidates from current agent state (materials, employment, literacy, peers). Always includes the survival skeleton, then appends rule-admitted dynamic actions, with a rejection reason when infeasible.
      
revision: 26dba326d0f79bf978188bf6f3ac73c02723ff58
updated_at: "2026-09-24T15:12:14.790Z"
fingerprint: 9e1003f8806eb10aa3fec7783d127dd97b96690200fb2c7a25008389169e7ba2
source:
  - path: "src/agent/decision/candidates.js"
apis:
  - protocol: rpc
    path: "agent.decision.candidates.plan"
    description:
      zh: >
          生成候选行动列表（生存骨架 + 规则准入的动态行动）。
          
      en: >
          Builds the candidate action list.
          
  - protocol: rpc
    path: "agent.decision.candidates.actions"
    description:
      zh: >
          返回全部可规划行动键。
          
      en: >
          Returns all plannable action keys.
          
  - protocol: rpc
    path: "agent.decision.candidates.rules"
    description:
      zh: >
          返回规则表（各行动的前置条件）。
          
      en: >
          Returns the rule table.
          
  - protocol: rpc
    path: "agent.decision.candidates.baseScores"
    description:
      zh: >
          返回各行动的基础分。
          
      en: >
          Returns base scores.
          
deps:
  - kind: call
    to: truman-town.agent.anticipation.pool.store
    label: {zh: "候选写入预想池", en: "Candidates written to pool"}
---

D0 行动空间地基：把「居民能做什么」从出生时固定改为逐 tick 按状态推导。
