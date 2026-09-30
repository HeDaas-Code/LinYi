---
uid: 4846942a
id: truman-town-flow.state.area.runtime.last-community-tick-3666605a
parent: truman-town-flow.state.area.runtime
name: {zh: "lastCommunityTick", en: "lastCommunityTick"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:115。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:115; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-community-tick-3666605a:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "last-community-tick-3666605a:write-runCommunity"
    description:
      zh: >
          写入方 runCommunity（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runCommunity
          
  - protocol: rpc
    path: "last-community-tick-3666605a:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "last-community-tick-3666605a:read-runCommunity"
    description:
      zh: >
          读取方 runCommunity
          
      en: >
          reader runCommunity
          
  - protocol: rpc
    path: "last-community-tick-3666605a:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:last-community-tick-3666605a:read-runCommunity"
    label: {zh: "读 lastCommunityTick", en: "read lastCommunityTick"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:last-community-tick-3666605a:read-__snapshot"
    label: {zh: "读 lastCommunityTick", en: "read lastCommunityTick"}
---
