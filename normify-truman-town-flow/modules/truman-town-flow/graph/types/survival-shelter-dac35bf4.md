---
uid: 9e8dda9a
id: truman-town-flow.graph.types.survival-shelter-dac35bf4
parent: truman-town-flow.graph.types
name: {zh: "survival.shelter", en: "survival.shelter"}
description:
  zh: >
      声明于 undefined:undefined。生产者 1 个，消费者 4 个。
  en: >
      Declared at undefined:undefined; producers=1, consumers=4
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "survival-shelter-dac35bf4:write.src_survival_shelter_js"
    description:
      zh: >
          生产者 src/survival/shelter.js
      en: >
          producer src/survival/shelter.js
  - protocol: rpc
    path: "survival-shelter-dac35bf4:read.src_runtime_orchestrator__stage2_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/_stage2.js
      en: >
          consumer src/runtime/orchestrator/_stage2.js
  - protocol: rpc
    path: "survival-shelter-dac35bf4:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
  - protocol: rpc
    path: "survival-shelter-dac35bf4:read.src_survival_events_impact_js"
    description:
      zh: >
          消费者 src/survival/events/impact.js
      en: >
          consumer src/survival/events/impact.js
  - protocol: rpc
    path: "survival-shelter-dac35bf4:read.src_survival_shelter_js"
    description:
      zh: >
          消费者 src/survival/shelter.js
      en: >
          consumer src/survival/shelter.js
---
