---
uid: dc500626
id: truman-town-flow.graph.types.observer-action-0b31b519
parent: truman-town-flow.graph.types
name: {zh: "observer.action", en: "observer.action"}
description:
  zh: >
      声明于 undefined:undefined。生产者 2 个，消费者 6 个。
  en: >
      Declared at undefined:undefined; producers=2, consumers=6
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "observer-action-0b31b519:write.src_observer_chronicle_store_js"
    description:
      zh: >
          生产者 src/observer/chronicle/store.js
      en: >
          producer src/observer/chronicle/store.js
  - protocol: rpc
    path: "observer-action-0b31b519:write.src_observer_recorder_action_log_js"
    description:
      zh: >
          生产者 src/observer/recorder/action-log.js
      en: >
          producer src/observer/recorder/action-log.js
  - protocol: rpc
    path: "observer-action-0b31b519:read.src_civilization_collapse_confirmer_js"
    description:
      zh: >
          消费者 src/civilization/collapse/confirmer.js
      en: >
          consumer src/civilization/collapse/confirmer.js
  - protocol: rpc
    path: "observer-action-0b31b519:read.src_civilization_restart_js"
    description:
      zh: >
          消费者 src/civilization/restart.js
      en: >
          consumer src/civilization/restart.js
  - protocol: rpc
    path: "observer-action-0b31b519:read.src_observer_chronicle_store_js"
    description:
      zh: >
          消费者 src/observer/chronicle/store.js
      en: >
          consumer src/observer/chronicle/store.js
  - protocol: rpc
    path: "observer-action-0b31b519:read.src_observer_recorder_action_log_js"
    description:
      zh: >
          消费者 src/observer/recorder/action-log.js
      en: >
          consumer src/observer/recorder/action-log.js
  - protocol: rpc
    path: "observer-action-0b31b519:read.src_runtime_orchestrator__stage2_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/_stage2.js
      en: >
          consumer src/runtime/orchestrator/_stage2.js
  - protocol: rpc
    path: "observer-action-0b31b519:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
---
