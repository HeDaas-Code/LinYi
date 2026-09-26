---
uid: 7a6f9e37
id: truman-town.runtime.orchestrator.loop
parent: truman-town.runtime.orchestrator
name: {zh: "主循环集成", en: "Main Loop Integration"}
description:
  zh: >
      把 clock → survival 事件 → 感知 → agent 决策 → ai.thought → dispatch → world-state 串成最小闭环主循环，并在每个决策/行为/事件节点写入观察者日志；phase2 开启时再把社交家族（生育）、经济市场（交易）、制作建造、城镇空间（居住分配）、健康疾病接入每 tick 流程；phase3 开启时再把政治派系、文化规范与仪式、心理创伤与崩溃、技术研究与失传、文明遗产与重启接入每 tick 流程。
      
  en: >
      Wires clock → survival events → perception → agent decision → ai.thought → dispatch → world-state into a minimal closed main loop, recording observer logs at every decision/action/event node; with phase2 enabled it also drives procreation, market trading, crafting, residence allocation and health checks each tick; with phase3 enabled it also drives politics, culture (norms/ritual/meme), psyche (trauma/coping/breakdown), tech (research/loss) and civilization (legacy/collapse/restart) each tick.
      
revision: 1639a6c056539210e6b26211bac5fd8b42cbc3a4
updated_at: "2026-09-26T03:35:10.006Z"
fingerprint: 2b62f3883af57730c5c0cba5917d217538ee4b861e0cc02178657c39919b6866
source:
  - path: "src/runtime/orchestrator/loop.js"
apis:
  - protocol: rpc
    path: "runtime.orchestrator.loop.spawnAgent"
    description:
      zh: >
          登记一个智能体并初始化其特质、预想池与初始需求。
          
      en: >
          Registers an agent and initializes its traits, anticipation pool and initial needs.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.step"
    description:
      zh: >
          推进一个 tick 的完整闭环（生存/感知/决策/思考/行动/世界状态）。
          
      en: >
          Advances one full closed-loop tick (survival/perception/decision/thought/action/world-state).
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.run"
    description:
      zh: >
          复位并运行 N 个 tick，返回整段运行的汇总报告。
          
      en: >
          Resets and runs N ticks, returning an aggregate report of the run.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.snapshot"
    description:
      zh: >
          返回当前世界状态、资源与编年计数的观测快照。
          
      en: >
          Returns an observation snapshot of world state, resources and chronicle counts.
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.reset"
    description:
      zh: >
          复位全部共享状态（graph/rng/identity/clock/world-state/registry/needs/recorder）。
          
      en: >
          Resets all shared state (graph/rng/identity/clock/world-state/registry/needs/recorder).
          
  - protocol: rpc
    path: "runtime.orchestrator.loop.foragePoolRemaining"
    description:
      zh: >
          返回世界采集池当前剩余量（每 tick 再生，供测试/观测）。
          
      en: >
          Returns the current remaining amount of the per-tick regenerating world forage pool (for tests/observation).
          
deps:
  - kind: call
    to: truman-town.runtime.clock
  - kind: call
    to: truman-town.runtime.world-state
  - kind: call
    to: truman-town.runtime.registry
  - kind: call
    to: truman-town.runtime.orchestrator.perception
  - kind: call
    to: truman-town.runtime.orchestrator.dispatch
  - kind: call
    to: truman-town.infra.identity
  - kind: call
    to: truman-town.infra.rng
  - kind: call
    to: truman-town.infra.store.graph
  - kind: call
    to: truman-town.agent.traits.tagset.store
  - kind: call
    to: truman-town.agent.anticipation.pool.store
  - kind: call
    to: truman-town.agent.anticipation.pool.selector
  - kind: call
    to: truman-town.agent.decision.context
  - kind: call
    to: truman-town.agent.decision.selector
  - kind: call
    to: truman-town.agent.memory.episodic.store
  - kind: call
    to: truman-town.agent.memory.episodic.recaller
  - kind: call
    to: truman-town.ai.thought
  - kind: call
    to: truman-town.survival.resources.food
  - kind: call
    to: truman-town.survival.resources.water
  - kind: call
    to: truman-town.survival.needs.meter
  - kind: call
    to: truman-town.survival.needs.pressure.scorer
  - kind: call
    to: truman-town.survival.events.generator.roller
  - kind: call
    to: truman-town.survival.events.generator.selector
  - kind: call
    to: truman-town.survival.events.impact
  - kind: call
    to: truman-town.observer.recorder
  - kind: call
    to: truman-town.observer.chronicle.compiler
  - kind: call
    to: truman-town.social.relationship.romance
  - kind: call
    to: truman-town.social.procreation.match
  - kind: call
    to: truman-town.social.procreation.offspring
  - kind: call
    to: truman-town.social.family.lineage
  - kind: call
    to: truman-town.economy.ledger.account
  - kind: call
    to: truman-town.economy.market.orderbook.orders
  - kind: call
    to: truman-town.economy.market.orderbook.matching
  - kind: call
    to: truman-town.economy.market.price
  - kind: call
    to: truman-town.town.building.structure
  - kind: call
    to: truman-town.town.residence
  - kind: call
    to: truman-town.agent.inventory.item
  - kind: call
    to: truman-town.agent.inventory.backpack
  - kind: call
    to: truman-town.agent.crafting.recipe
  - kind: call
    to: truman-town.agent.crafting.workbench.executor
  - kind: call
    to: truman-town.agent.crafting.construction
  - kind: call
    to: truman-town.agent.crafting.writing
  - kind: call
    to: truman-town.survival.health.disease
  - kind: call
    to: truman-town.survival.health.treatment
  - kind: call
    to: truman-town.survival.health.epidemic
  - kind: call
    to: truman-town.social.politics.faction
  - kind: call
    to: truman-town.social.politics.law
  - kind: call
    to: truman-town.social.politics.leader
  - kind: call
    to: truman-town.social.politics.conflict
  - kind: call
    to: truman-town.social.culture.norms
  - kind: call
    to: truman-town.social.culture.ritual
  - kind: call
    to: truman-town.social.culture.meme
  - kind: call
    to: truman-town.agent.psyche.trauma
  - kind: call
    to: truman-town.agent.psyche.coping
  - kind: call
    to: truman-town.agent.psyche.break
  - kind: call
    to: truman-town.civilization.tech.tree
  - kind: call
    to: truman-town.civilization.tech.research
  - kind: call
    to: truman-town.civilization.tech.lock
  - kind: call
    to: truman-town.civilization.legacy.graph
  - kind: call
    to: truman-town.civilization.legacy.summary.extractor
  - kind: call
    to: truman-town.civilization.legacy.summary.writer
  - kind: call
    to: truman-town.civilization.collapse.detector
  - kind: call
    to: truman-town.civilization.collapse.confirmer
  - kind: call
    to: truman-town.civilization.restart
  - kind: call
    to: truman-town.agent.anticipation.pool.pruner
  - kind: call
    to: truman-town.agent.decision.candidates
  - kind: call
    to: truman-town.agent.persona.personality
  - kind: call
    to: truman-town.runtime.orchestrator.stage2
---

## 第三阶段集成（phase3）

`run({ phase3: true, ... })` / `step({ phase3: true })` 时，主循环在每个 tick 额外驱动以下子系统（实现于内部辅助模块 `src/runtime/orchestrator/_stage3.js`，不作为独立 Normify 模块暴露）：

1. **政治派系** — `politics.faction.form/join/ally` 组派系、`politics.leader.elect` 选举、`politics.law.propose/vote/enforce` 立法执法、`politics.conflict.start/escalate/resolve` 冲突升级与调停，写 `event-log`（politics.*）。
2. **文化规范与仪式** — `culture.norms.update/violate` 规范与违规压力、`culture.ritual.schedule/hold` 周期仪式、`culture.meme.spread/mutate` 模因传播与变异，写 `event-log`（culture.*）。
3. **心理创伤与崩溃** — `psyche.trauma.accumulate` 压力累积创伤、`psyche.break.check` 崩溃/恢复判定、`psyche.coping.execute` 应对疗愈，写 `event-log`（psyche.breakdown / psyche.recovery）。
4. **技术研究与失传** — `tech.research.start/progress/complete` 研究推进 → `tech.tree.unlock` 突破、`tech.lock.detect/apply` 失传锁定，写 `event-log`（civilization.tech.*）。
5. **文明遗产与重启** — `collapse.detector.detect` 崩溃检测 → `collapse.confirmer.confirm` 确认 → `legacy.graph.build` 图谱 → `legacy.summary.writer` 遗产描述 → `restart.execute` 重启注入下一代，写 `event-log`（civilization.collapse/restart/heritage.inherited）。
