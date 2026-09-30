---
uid: ca4a4dad
id: truman-town-flow.state.area.runtime.committed-tick-5c00f420
parent: truman-town-flow.state.area.runtime
name: {zh: "committedTick", en: "committedTick"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/loop.js:170。写入方 2 个、读取方 5 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/loop.js:170; writers=2, readers=5
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "committed-tick-5c00f420:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/loop.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "committed-tick-5c00f420:write-markRestored"
    description:
      zh: >
          写入方 markRestored（src/runtime/orchestrator/loop.js）
          
      en: >
          writer markRestored
          
  - protocol: rpc
    path: "committed-tick-5c00f420:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "committed-tick-5c00f420:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
  - protocol: rpc
    path: "committed-tick-5c00f420:read-snapshot"
    description:
      zh: >
          读取方 snapshot
          
      en: >
          reader snapshot
          
  - protocol: rpc
    path: "committed-tick-5c00f420:read-markRestored"
    description:
      zh: >
          读取方 markRestored
          
      en: >
          reader markRestored
          
  - protocol: rpc
    path: "committed-tick-5c00f420:read-tickStatus"
    description:
      zh: >
          读取方 tickStatus
          
      en: >
          reader tickStatus
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:committed-tick-5c00f420:read-__snapshot"
    label: {zh: "读 committedTick", en: "read committedTick"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:committed-tick-5c00f420:read-__restore"
    label: {zh: "读 committedTick", en: "read committedTick"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:committed-tick-5c00f420:read-snapshot"
    label: {zh: "读 committedTick", en: "read committedTick"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:committed-tick-5c00f420:read-markRestored"
    label: {zh: "读 committedTick", en: "read committedTick"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:committed-tick-5c00f420:read-tickStatus"
    label: {zh: "读 committedTick", en: "read committedTick"}
---
