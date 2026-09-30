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
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:55.685Z"
fingerprint: ca20c86692a41d7289dd669dd5dda2d80fc40f0f389c020ca76e53e93bb6bc8d
source:
  - path: "src/runtime/orchestrator/dispatch.js"
apis:
  - protocol: rpc
    path: "runtime.orchestrator.dispatch.resolve"
    description:
      zh: >
          resolve：模块导出函数。
          
      en: >
          resolve: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.dispatch.actions"
    description:
      zh: >
          actions：模块导出函数。
          
      en: >
          actions: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.op-seq-17675579
    to_api: "rpc:op-seq-17675579:write-normalizeDecision"
    label: {zh: "写 opSeq", en: "write opSeq"}
---
