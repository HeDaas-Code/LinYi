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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:46.551Z"
fingerprint: pending
source: []
apis: []
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
