---
uid: e12ad67d
id: truman-town-flow.graph.types.town-residence-1ffad15f
parent: truman-town-flow.graph.types
name: {zh: "town.residence", en: "town.residence"}
description:
  zh: >
      声明于 undefined:undefined。生产者 2 个，消费者 4 个。
  en: >
      Declared at undefined:undefined; producers=2, consumers=4
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "town-residence-1ffad15f:write.src_survival_shelter_js"
    description:
      zh: >
          生产者 src/survival/shelter.js
      en: >
          producer src/survival/shelter.js
  - protocol: rpc
    path: "town-residence-1ffad15f:write.src_town_residence_js"
    description:
      zh: >
          生产者 src/town/residence.js
      en: >
          producer src/town/residence.js
  - protocol: rpc
    path: "town-residence-1ffad15f:read.src_runtime_orchestrator__stage2_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/_stage2.js
      en: >
          consumer src/runtime/orchestrator/_stage2.js
  - protocol: rpc
    path: "town-residence-1ffad15f:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
  - protocol: rpc
    path: "town-residence-1ffad15f:read.src_survival_shelter_js"
    description:
      zh: >
          消费者 src/survival/shelter.js
      en: >
          consumer src/survival/shelter.js
  - protocol: rpc
    path: "town-residence-1ffad15f:read.src_town_residence_js"
    description:
      zh: >
          消费者 src/town/residence.js
      en: >
          consumer src/town/residence.js
---
