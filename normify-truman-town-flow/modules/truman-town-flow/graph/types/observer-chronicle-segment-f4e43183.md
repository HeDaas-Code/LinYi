---
uid: "63824084"
id: truman-town-flow.graph.types.observer-chronicle-segment-f4e43183
parent: truman-town-flow.graph.types
name: {zh: "observer.chronicle.segment", en: "observer.chronicle.segment"}
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
    path: "observer-chronicle-segment-f4e43183:write.src_observer_chronicle_store_js"
    description:
      zh: >
          生产者 src/observer/chronicle/store.js
      en: >
          producer src/observer/chronicle/store.js
  - protocol: rpc
    path: "observer-chronicle-segment-f4e43183:read.src_observer_chronicle_store_js"
    description:
      zh: >
          消费者 src/observer/chronicle/store.js
      en: >
          consumer src/observer/chronicle/store.js
  - protocol: rpc
    path: "observer-chronicle-segment-f4e43183:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
---
