---
uid: "94723130"
id: truman-town-flow.state.area.runtime.recent-post-ids-5ac5dfff
parent: truman-town-flow.state.area.runtime
name: {zh: "recentPostIds", en: "recentPostIds"}
description:
  zh: >
      array 类型，声明于 src/runtime/orchestrator/_stage2.js:127。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      array declared at src/runtime/orchestrator/_stage2.js:127; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "recent-post-ids-5ac5dfff:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "recent-post-ids-5ac5dfff:write-runPlatform"
    description:
      zh: >
          写入方 runPlatform（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runPlatform
          
  - protocol: rpc
    path: "recent-post-ids-5ac5dfff:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "recent-post-ids-5ac5dfff:read-runPlatform"
    description:
      zh: >
          读取方 runPlatform
          
      en: >
          reader runPlatform
          
  - protocol: rpc
    path: "recent-post-ids-5ac5dfff:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:recent-post-ids-5ac5dfff:read-runPlatform"
    label: {zh: "读 recentPostIds", en: "read recentPostIds"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:recent-post-ids-5ac5dfff:read-__snapshot"
    label: {zh: "读 recentPostIds", en: "read recentPostIds"}
---
