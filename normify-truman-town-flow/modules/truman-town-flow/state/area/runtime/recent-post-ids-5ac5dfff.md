---
uid: "94723130"
id: truman-town-flow.state.area.runtime.recent-post-ids-5ac5dfff
parent: truman-town-flow.state.area.runtime
name: {zh: "recentPostIds", en: "recentPostIds"}
description:
  zh: >
      array 类型，声明于 src/runtime/orchestrator/_stage2.js:117。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      array declared at src/runtime/orchestrator/_stage2.js:117; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:38.768Z"
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
    path: "recent-post-ids-5ac5dfff:read-runPlatform"
    description:
      zh: >
          读取方 runPlatform
          
      en: >
          reader runPlatform
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:recent-post-ids-5ac5dfff:read-runPlatform"
    label: {zh: "读 recentPostIds", en: "read recentPostIds"}
---
