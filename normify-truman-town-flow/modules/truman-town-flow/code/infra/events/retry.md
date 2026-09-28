---
uid: 14d9abfa
id: truman-town-flow.code.infra.events.retry
parent: truman-town-flow.code.infra.events
name: {zh: "infra/events/retry.js", en: "infra/events/retry.js"}
description:
  zh: >
      代码模块 src/infra/events/retry.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/infra/events/retry.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:47.759Z"
fingerprint: 5f80d410f398d78226194ad2d4287e00c4191c4e7721b13518be35ca1568b2b6
source:
  - path: "src/infra/events/retry.js"
apis:
  - protocol: rpc
    path: "infra.events.retry.enqueue"
    description:
      zh: >
          enqueue：模块导出函数。
          
      en: >
          enqueue: exported module function.
          
  - protocol: rpc
    path: "infra.events.retry.run"
    description:
      zh: >
          run：模块导出函数。
          
      en: >
          run: exported module function.
          
  - protocol: rpc
    path: "infra.events.retry.pending"
    description:
      zh: >
          pending：模块导出函数。
          
      en: >
          pending: exported module function.
          
  - protocol: rpc
    path: "infra.events.retry.dead"
    description:
      zh: >
          dead：模块导出函数。
          
      en: >
          dead: exported module function.
          
  - protocol: rpc
    path: "infra.events.retry.getStats"
    description:
      zh: >
          getStats：模块导出函数。
          
      en: >
          getStats: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.infra.queue-d30bf235
    to_api: "rpc:queue-d30bf235:write-enqueue"
    label: {zh: "写 queue", en: "write queue"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.queue-d30bf235
    to_api: "rpc:queue-d30bf235:write-run"
    label: {zh: "写 queue", en: "write queue"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.dead-letters-5964bca1
    to_api: "rpc:dead-letters-5964bca1:write-run"
    label: {zh: "写 deadLetters", en: "write deadLetters"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.phase-947d7802
    to_api: "rpc:phase-947d7802:write-run"
    label: {zh: "写 phase", en: "write phase"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.step-fn-32e16585
    to_api: "rpc:step-fn-32e16585:write-run"
    label: {zh: "写 stepFn", en: "write stepFn"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.step-count-fcd89684
    to_api: "rpc:step-count-fcd89684:write-run"
    label: {zh: "写 stepCount", en: "write stepCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.current-seed-ffaa622b
    to_api: "rpc:current-seed-ffaa622b:write-run"
    label: {zh: "写 currentSeed", en: "write currentSeed"}
---
