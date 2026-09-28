---
uid: e412804d
id: truman-town-flow.code.runtime.clock
parent: truman-town-flow.code.runtime
name: {zh: "runtime/clock.js", en: "runtime/clock.js"}
description:
  zh: >
      代码模块 src/runtime/clock.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/clock.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:54.158Z"
fingerprint: 47d6082f871f46e7c87f33b976c56348de6a06a10197195c8ec51d24e3c684a9
source:
  - path: "src/runtime/clock.js"
apis:
  - protocol: rpc
    path: "runtime.clock.now"
    description:
      zh: >
          now：模块导出函数。
          
      en: >
          now: exported module function.
          
  - protocol: rpc
    path: "runtime.clock.tick"
    description:
      zh: >
          tick：模块导出函数。
          
      en: >
          tick: exported module function.
          
  - protocol: rpc
    path: "runtime.clock.schedule"
    description:
      zh: >
          schedule：模块导出函数。
          
      en: >
          schedule: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.current-tick-af3bf7fd
    to_api: "rpc:current-tick-af3bf7fd:write-tick"
    label: {zh: "写 currentTick", en: "write currentTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.started-at-46c5f2b9
    to_api: "rpc:started-at-46c5f2b9:write-tick"
    label: {zh: "写 startedAt", en: "write startedAt"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.tasks-79b3964f
    to_api: "rpc:tasks-79b3964f:write-schedule"
    label: {zh: "写 tasks", en: "write tasks"}
---
