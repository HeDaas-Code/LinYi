---
uid: 9a88f9df
id: truman-town-flow.graph.types.survival-goal-8264183c
parent: truman-town-flow.graph.types
name: {zh: "survival.goal", en: "survival.goal"}
description:
  zh: >
      声明于 undefined:undefined。生产者 1 个，消费者 2 个。
  en: >
      Declared at undefined:undefined; producers=1, consumers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "survival-goal-8264183c:write.src_survival_goal_js"
    description:
      zh: >
          生产者 src/survival/goal.js
      en: >
          producer src/survival/goal.js
  - protocol: rpc
    path: "survival-goal-8264183c:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
  - protocol: rpc
    path: "survival-goal-8264183c:read.src_survival_goal_js"
    description:
      zh: >
          消费者 src/survival/goal.js
      en: >
          consumer src/survival/goal.js
---
