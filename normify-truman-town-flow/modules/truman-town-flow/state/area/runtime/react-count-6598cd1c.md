---
uid: 493c5f99
id: truman-town-flow.state.area.runtime.react-count-6598cd1c
parent: truman-town-flow.state.area.runtime
name: {zh: "reactCount", en: "reactCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:120。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:120; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "react-count-6598cd1c:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "react-count-6598cd1c:write-runPlatform"
    description:
      zh: >
          写入方 runPlatform（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runPlatform
          
  - protocol: rpc
    path: "react-count-6598cd1c:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "react-count-6598cd1c:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "react-count-6598cd1c:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:react-count-6598cd1c:read-summary"
    label: {zh: "读 reactCount", en: "read reactCount"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:react-count-6598cd1c:read-__snapshot"
    label: {zh: "读 reactCount", en: "read reactCount"}
---
