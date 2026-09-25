---
uid: e7b3f908
id: truman-town.runtime.orchestrator.stage2
parent: truman-town.runtime.orchestrator
name: {zh: "第二阶段编排", en: "Phase-2 Orchestration"}
description:
  zh: >
      阶段二世界推进：产业/经济/制作队列推进、居民自选行动的实际执行（performAgentAction，含 P1 新增的 socialize/court/accept 与由居民双向决策产生的婚配）、社会与家庭汇总、疾病分诊等。
      
  en: >
      Phase-2 world stepping: industry/economy/craft queue advancement, execution of agent-chosen actions (including socialize/court/accept and decision-driven pairing), social and family aggregation, triage.
      
revision: 36ce55d9e3d8994abf455c13925f0c4f4a3f316c
updated_at: "2026-09-25T09:50:48.373Z"
fingerprint: 0b013953a02189bc425ae4e66d072a4cc14f39ba2d783523a619a8866c5c8160
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
