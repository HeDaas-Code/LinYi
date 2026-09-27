---
uid: 9d84e4bd
id: truman-town-flow.state.area.runtime.last-feed-tick-142dc6ab
parent: truman-town-flow.state.area.runtime
name: {zh: "lastFeedTick", en: "lastFeedTick"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:124。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:124; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-feed-tick-142dc6ab:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "last-feed-tick-142dc6ab:write-runPlatform"
    description:
      zh: >
          写入方 runPlatform（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runPlatform
          
  - protocol: rpc
    path: "last-feed-tick-142dc6ab:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "last-feed-tick-142dc6ab:read-runPlatform"
    description:
      zh: >
          读取方 runPlatform
          
      en: >
          reader runPlatform
          
  - protocol: rpc
    path: "last-feed-tick-142dc6ab:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:last-feed-tick-142dc6ab:read-runPlatform"
    label: {zh: "读 lastFeedTick", en: "read lastFeedTick"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:last-feed-tick-142dc6ab:read-__snapshot"
    label: {zh: "读 lastFeedTick", en: "read lastFeedTick"}
---
