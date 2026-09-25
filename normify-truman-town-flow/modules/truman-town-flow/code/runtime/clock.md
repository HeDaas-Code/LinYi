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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:46.551Z"
fingerprint: pending
source: []
apis: []
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
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.settled-agent-ids-6dcf86b2
    to_api: "rpc:settled-agent-ids-6dcf86b2:write-tick"
    label: {zh: "写 settledAgentIds", en: "write settledAgentIds"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.candidate-state-cache-93c7ac3d
    to_api: "rpc:candidate-state-cache-93c7ac3d:write-tick"
    label: {zh: "写 _candidateStateCac", en: "write _candidateStateCac"}
---
