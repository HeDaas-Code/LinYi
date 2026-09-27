---
uid: 8c4d5541
id: truman-town-flow.state.area.runtime.background-driver-94c939df
parent: truman-town-flow.state.area.runtime
name: {zh: "backgroundDriver", en: "backgroundDriver"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/stage-progress.js:44。写入方 1 个、读取方 3 个；已纳入复位。
      
  en: >
      flag declared at src/runtime/orchestrator/stage-progress.js:44; writers=1, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "background-driver-94c939df:write-setBackgroundDriver"
    description:
      zh: >
          写入方 setBackgroundDriver（src/runtime/orchestrator/stage-progress.js）
          
      en: >
          writer setBackgroundDriver
          
  - protocol: rpc
    path: "background-driver-94c939df:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "background-driver-94c939df:read-setBackgroundDriver"
    description:
      zh: >
          读取方 setBackgroundDriver
          
      en: >
          reader setBackgroundDriver
          
  - protocol: rpc
    path: "background-driver-94c939df:read-hasBackgroundDriver"
    description:
      zh: >
          读取方 hasBackgroundDriver
          
      en: >
          reader hasBackgroundDriver
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:background-driver-94c939df:read-summary"
    label: {zh: "读 backgroundDriver", en: "read backgroundDriver"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage-progress
    from_api: "rpc:background-driver-94c939df:read-setBackgroundDriver"
    label: {zh: "读 backgroundDriver", en: "read backgroundDriver"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage-progress
    from_api: "rpc:background-driver-94c939df:read-hasBackgroundDriver"
    label: {zh: "读 backgroundDriver", en: "read backgroundDriver"}
---
