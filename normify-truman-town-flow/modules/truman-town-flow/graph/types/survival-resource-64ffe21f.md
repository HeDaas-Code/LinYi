---
uid: a5bc25ef
id: truman-town-flow.graph.types.survival-resource-64ffe21f
parent: truman-town-flow.graph.types
name: {zh: "survival.resource", en: "survival.resource"}
description:
  zh: >
      声明于 undefined:undefined。生产者 1 个，消费者 11 个。
  en: >
      Declared at undefined:undefined; producers=1, consumers=11
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "survival-resource-64ffe21f:write.src_survival_resources__resource_js"
    description:
      zh: >
          生产者 src/survival/resources/_resource.js
      en: >
          producer src/survival/resources/_resource.js
  - protocol: rpc
    path: "survival-resource-64ffe21f:read.src_civilization_tech__energy_js"
    description:
      zh: >
          消费者 src/civilization/tech/_energy.js
      en: >
          consumer src/civilization/tech/_energy.js
  - protocol: rpc
    path: "survival-resource-64ffe21f:read.src_civilization_tech_research_js"
    description:
      zh: >
          消费者 src/civilization/tech/research.js
      en: >
          consumer src/civilization/tech/research.js
  - protocol: rpc
    path: "survival-resource-64ffe21f:read.src_economy_industry_production_js"
    description:
      zh: >
          消费者 src/economy/industry/production.js
      en: >
          consumer src/economy/industry/production.js
  - protocol: rpc
    path: "survival-resource-64ffe21f:read.src_runtime_orchestrator__stage2_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/_stage2.js
      en: >
          consumer src/runtime/orchestrator/_stage2.js
  - protocol: rpc
    path: "survival-resource-64ffe21f:read.src_runtime_orchestrator__stage3_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/_stage3.js
      en: >
          consumer src/runtime/orchestrator/_stage3.js
  - protocol: rpc
    path: "survival-resource-64ffe21f:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
---
