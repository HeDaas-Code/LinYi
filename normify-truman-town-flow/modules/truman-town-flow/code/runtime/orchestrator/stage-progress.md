---
uid: 5067f213
id: truman-town-flow.code.runtime.orchestrator.stage-progress
parent: truman-town-flow.code.runtime.orchestrator
name: {zh: "runtime/orchestrator/stage-progress.js", en: "runtime/orchestrator/stage-progress.js"}
description:
  zh: >
      代码模块 src/runtime/orchestrator/stage-progress.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/orchestrator/stage-progress.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:24.455Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.current-tick-0b324fd7
    to_api: "rpc:current-tick-0b324fd7:write-begin"
    label: {zh: "写 currentTick", en: "write currentTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.current-tick-0b324fd7
    to_api: "rpc:current-tick-0b324fd7:write-commit"
    label: {zh: "写 currentTick", en: "write currentTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.current-tick-0b324fd7
    to_api: "rpc:current-tick-0b324fd7:write-fail"
    label: {zh: "写 currentTick", en: "write currentTick"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.recent-eb8e2b46
    to_api: "rpc:recent-eb8e2b46:write-pushRecent"
    label: {zh: "写 recent", en: "write recent"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.background-driver-94c939df
    to_api: "rpc:background-driver-94c939df:write-setBackgroundDriver"
    label: {zh: "写 backgroundDriver", en: "write backgroundDriver"}
---
