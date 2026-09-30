---
uid: b47a6c61
id: truman-town-flow.code.runtime.orchestrator.cycle
parent: truman-town-flow.code.runtime.orchestrator
name: {zh: "runtime/orchestrator/cycle.js", en: "runtime/orchestrator/cycle.js"}
description:
  zh: >
      代码模块 src/runtime/orchestrator/cycle.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/orchestrator/cycle.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:54.931Z"
fingerprint: 624f64df5eb8310d134cd3f4208fc3865fc09f8c012516568dc7eb4be7cb5600
source:
  - path: "src/runtime/orchestrator/cycle.js"
apis:
  - protocol: rpc
    path: "runtime.orchestrator.cycle.configure"
    description:
      zh: >
          configure：模块导出函数。
          
      en: >
          configure: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.cycle.run"
    description:
      zh: >
          run：模块导出函数。
          
      en: >
          run: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.cycle.pause"
    description:
      zh: >
          pause：模块导出函数。
          
      en: >
          pause: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.cycle.resume"
    description:
      zh: >
          resume：模块导出函数。
          
      en: >
          resume: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.phase-947d7802
    to_api: "rpc:phase-947d7802:write-resume"
    label: {zh: "写 phase", en: "write phase"}
---
