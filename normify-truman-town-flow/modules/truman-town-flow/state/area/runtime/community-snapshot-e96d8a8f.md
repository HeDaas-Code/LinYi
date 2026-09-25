---
uid: b2e45444
id: truman-town-flow.state.area.runtime.community-snapshot-e96d8a8f
parent: truman-town-flow.state.area.runtime
name: {zh: "communitySnapshot", en: "communitySnapshot"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage2.js:106。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage2.js:106; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:36.897Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "community-snapshot-e96d8a8f:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "community-snapshot-e96d8a8f:write-runCommunity"
    description:
      zh: >
          写入方 runCommunity（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runCommunity
          
  - protocol: rpc
    path: "community-snapshot-e96d8a8f:read-runPlatform"
    description:
      zh: >
          读取方 runPlatform
          
      en: >
          reader runPlatform
          
  - protocol: rpc
    path: "community-snapshot-e96d8a8f:read-runCommunity"
    description:
      zh: >
          读取方 runCommunity
          
      en: >
          reader runCommunity
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:community-snapshot-e96d8a8f:read-runPlatform"
    label: {zh: "读 communitySnapshot", en: "read communitySnapshot"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:community-snapshot-e96d8a8f:read-runCommunity"
    label: {zh: "读 communitySnapshot", en: "read communitySnapshot"}
---
