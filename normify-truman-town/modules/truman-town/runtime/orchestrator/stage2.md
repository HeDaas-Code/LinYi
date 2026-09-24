---
uid: e7b3f908
id: truman-town.runtime.orchestrator.stage2
parent: truman-town.runtime.orchestrator
name: {zh: "第二阶段编排", en: "Phase-2 Orchestration"}
description:
  zh: >
      阶段二世界推进：产业/经济/制作队列推进、居民自选行动的实际执行（performAgentAction）、社会与家庭汇总、疾病分诊等。
      
  en: >
      Phase-2 world stepping: industry/economy/craft queue advancement, execution of agent-chosen actions, social and family aggregation, triage.
      
revision: 26dba326d0f79bf978188bf6f3ac73c02723ff58
updated_at: "2026-09-24T15:12:14.790Z"
fingerprint: 9f12aa0667e772971098ef8c79cab0d6980cb3186ad48e9a4c251982fadea2bd
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
    label: {zh: "推进制作队列", en: "Advance craft queue"}
  - kind: call
    to: truman-town.economy.industry.production
    label: {zh: "生产计划", en: "Production planning"}
  - kind: call
    to: truman-town.observer.recorder
    label: {zh: "记录居民行动事件", en: "Record agent action events"}
---

D0：阶段二承载「居民自选行动」的真实执行路径。
