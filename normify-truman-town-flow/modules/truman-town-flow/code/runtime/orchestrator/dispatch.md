---
uid: f641293b
id: truman-town-flow.code.runtime.orchestrator.dispatch
parent: truman-town-flow.code.runtime.orchestrator
name: {zh: "runtime/orchestrator/dispatch.js", en: "runtime/orchestrator/dispatch.js"}
description:
  zh: >
      代码模块 src/runtime/orchestrator/dispatch.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/orchestrator/dispatch.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:24.455Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.op-seq-17675579
    to_api: "rpc:op-seq-17675579:write-normalizeDecision"
    label: {zh: "写 opSeq", en: "write opSeq"}
---
