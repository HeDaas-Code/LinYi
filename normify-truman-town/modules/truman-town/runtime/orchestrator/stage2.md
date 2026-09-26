---
uid: e7b3f908
id: truman-town.runtime.orchestrator.stage2
parent: truman-town.runtime.orchestrator
name: {zh: "第二阶段编排", en: "Phase-2 Orchestration"}
description:
  zh: >
      阶段二世界推进：产业/经济/制作队列推进、居民自选行动的实际执行（performAgentAction，含 socialize/court/accept 与由居民双向决策产生的婚配，以及居民自主创办企业的 found），并在企业成立后为其招募工人与放发创业贷款；另含社会与家庭汇总、疾病分诊等。
  en: >
      Phase-2 world advance: industry/economy/crafting queues, execution of agent-chosen actions, and post-founding recruitment plus start-up credit for firms; also social and family rollups and disease triage.
revision: 45f6c8b7b8ba210fcd94506b2097c8e601dd1382
updated_at: "2026-09-26T01:47:11.884Z"
fingerprint: 52f3c1372061cd041d760fedf6d65a7b2a30515feb037c3b1bf08811a12be21b
source:
  - path: "src/runtime/orchestrator/_stage2.js"
apis:
  - protocol: rpc
    path: "orchestrator.stage2.tick"
    description:
      zh: >
          推进一步阶段二世界状态。
          
      en: >
          Advances phase-2 world state by one tick.
          
  - protocol: rpc
    path: "orchestrator.stage2.performAgentAction"
    description:
      zh: >
          执行居民自己选择的动态行动（craft/build/write/work/trade/socialize/court），不可行时不改世界。
          
      en: >
          Executes an agent-chosen dynamic action; leaves world untouched when infeasible.
          
  - protocol: rpc
    path: "orchestrator.stage2.candidateStateFor"
    description:
      zh: >
          返回候选刷新所需的状态（hasPeer/employed/businessActive），按 tick 缓存。
          
      en: >
          Returns candidate-refresh state, cached per tick.
          
  - protocol: rpc
    path: "orchestrator.stage2.craftMaterialId"
    description:
      zh: >
          返回制作所需材料物品 id。
          
      en: >
          Returns the crafting material item id.
          
  - protocol: rpc
    path: "orchestrator.stage2.__reset"
    description:
      zh: >
          复位阶段二状态。
          
      en: >
          Resets phase-2 state.
          
deps:
  - kind: call
    to: truman-town.agent.crafting.workbench.executor
  - kind: call
    to: truman-town.economy.industry.production
  - kind: call
    to: truman-town.economy.industry.business
  - kind: call
    to: truman-town.economy.industry.labour
  - kind: call
    to: truman-town.economy.bank.credit
  - kind: call
    to: truman-town.economy.ledger.account
  - kind: call
    to: truman-town.economy.market.price
  - kind: call
    to: truman-town.observer.recorder
  - kind: call
    to: truman-town.runtime.world-state
  - kind: call
    to: truman-town.agent.decision.candidates
  - kind: call
    to: truman-town.infra.config
---

D0：阶段二承载「居民自选行动」的真实执行路径。
