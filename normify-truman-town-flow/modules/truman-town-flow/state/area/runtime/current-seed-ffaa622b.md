---
uid: 5a8765f0
id: truman-town-flow.state.area.runtime.current-seed-ffaa622b
parent: truman-town-flow.state.area.runtime
name: {zh: "currentSeed", en: "currentSeed"}
description:
  zh: >
      string 类型，声明于 src/runtime/orchestrator/loop.js:161。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      string declared at src/runtime/orchestrator/loop.js:161; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "current-seed-ffaa622b:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/loop.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "current-seed-ffaa622b:write-run"
    description:
      zh: >
          写入方 run（src/runtime/orchestrator/loop.js）
          
      en: >
          writer run
          
  - protocol: rpc
    path: "current-seed-ffaa622b:read-seedAgentScheduleRoles"
    description:
      zh: >
          读取方 seedAgentScheduleRoles
          
      en: >
          reader seedAgentScheduleRoles
          
  - protocol: rpc
    path: "current-seed-ffaa622b:read-decide"
    description:
      zh: >
          读取方 decide
          
      en: >
          reader decide
          
  - protocol: rpc
    path: "current-seed-ffaa622b:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:current-seed-ffaa622b:read-seedAgentScheduleRoles"
    label: {zh: "读 currentSeed", en: "read currentSeed"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:current-seed-ffaa622b:read-decide"
    label: {zh: "读 currentSeed", en: "read currentSeed"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:current-seed-ffaa622b:read-__snapshot"
    label: {zh: "读 currentSeed", en: "read currentSeed"}
---
