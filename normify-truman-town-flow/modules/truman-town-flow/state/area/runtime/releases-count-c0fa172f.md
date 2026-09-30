---
uid: fdb2b0e3
id: truman-town-flow.state.area.runtime.releases-count-c0fa172f
parent: truman-town-flow.state.area.runtime
name: {zh: "releasesCount", en: "releasesCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:96。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:96; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "releases-count-c0fa172f:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "releases-count-c0fa172f:write-runHealth"
    description:
      zh: >
          写入方 runHealth（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runHealth
          
  - protocol: rpc
    path: "releases-count-c0fa172f:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "releases-count-c0fa172f:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "releases-count-c0fa172f:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:releases-count-c0fa172f:read-summary"
    label: {zh: "读 releasesCount", en: "read releasesCount"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:releases-count-c0fa172f:read-__snapshot"
    label: {zh: "读 releasesCount", en: "read releasesCount"}
---
