---
uid: 7dd53fd6
id: truman-town-flow.state.area.runtime.recent-eb8e2b46
parent: truman-town-flow.state.area.runtime
name: {zh: "recent", en: "recent"}
description:
  zh: >
      array 类型，声明于 src/runtime/orchestrator/stage-progress.js:42。写入方 1 个、读取方 3 个；已纳入复位。
      
  en: >
      array declared at src/runtime/orchestrator/stage-progress.js:42; writers=1, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "recent-eb8e2b46:write-pushRecent"
    description:
      zh: >
          写入方 pushRecent（src/runtime/orchestrator/stage-progress.js）
          
      en: >
          writer pushRecent
          
  - protocol: rpc
    path: "recent-eb8e2b46:read-recentTicks"
    description:
      zh: >
          读取方 recentTicks
          
      en: >
          reader recentTicks
          
  - protocol: rpc
    path: "recent-eb8e2b46:read-lastCommitted"
    description:
      zh: >
          读取方 lastCommitted
          
      en: >
          reader lastCommitted
          
  - protocol: rpc
    path: "recent-eb8e2b46:read-lastFailure"
    description:
      zh: >
          读取方 lastFailure
          
      en: >
          reader lastFailure
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage-progress
    from_api: "rpc:recent-eb8e2b46:read-recentTicks"
    label: {zh: "读 recent", en: "read recent"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage-progress
    from_api: "rpc:recent-eb8e2b46:read-lastCommitted"
    label: {zh: "读 recent", en: "read recent"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage-progress
    from_api: "rpc:recent-eb8e2b46:read-lastFailure"
    label: {zh: "读 recent", en: "read recent"}
---
