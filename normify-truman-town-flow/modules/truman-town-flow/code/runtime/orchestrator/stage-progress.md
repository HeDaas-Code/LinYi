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
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:57.421Z"
fingerprint: 9c43891c619c9b05dab76d9ccea5c706159c4be76005d81831df1067e3f79dc6
source:
  - path: "src/runtime/orchestrator/stage-progress.js"
apis:
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.begin"
    description:
      zh: >
          begin：模块导出函数。
          
      en: >
          begin: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.unit"
    description:
      zh: >
          unit：模块导出函数。
          
      en: >
          unit: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.commit"
    description:
      zh: >
          commit：模块导出函数。
          
      en: >
          commit: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.fail"
    description:
      zh: >
          fail：模块导出函数。
          
      en: >
          fail: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.current"
    description:
      zh: >
          current：模块导出函数。
          
      en: >
          current: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.recentTicks"
    description:
      zh: >
          recentTicks：模块导出函数。
          
      en: >
          recentTicks: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.lastCommitted"
    description:
      zh: >
          lastCommitted：模块导出函数。
          
      en: >
          lastCommitted: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.lastFailure"
    description:
      zh: >
          lastFailure：模块导出函数。
          
      en: >
          lastFailure: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.summary"
    description:
      zh: >
          summary：模块导出函数。
          
      en: >
          summary: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.setBackgroundDriver"
    description:
      zh: >
          setBackgroundDriver：模块导出函数。
          
      en: >
          setBackgroundDriver: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.restorableState"
    description:
      zh: >
          restorableState：模块导出函数。
          
      en: >
          restorableState: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.observationalMeta"
    description:
      zh: >
          observationalMeta：模块导出函数。
          
      en: >
          observationalMeta: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.stage-progress.hasBackgroundDriver"
    description:
      zh: >
          hasBackgroundDriver：模块导出函数。
          
      en: >
          hasBackgroundDriver: exported module function.
          
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
