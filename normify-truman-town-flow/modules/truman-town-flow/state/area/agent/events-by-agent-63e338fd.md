---
uid: 8b78f7b3
id: truman-town-flow.state.area.agent.events-by-agent-63e338fd
parent: truman-town-flow.state.area.agent
name: {zh: "eventsByAgent", en: "eventsByAgent"}
description:
  zh: >
      map 类型，声明于 src/agent/psyche/trauma.js:23。写入方 3 个、读取方 3 个；已纳入复位。
      
  en: >
      map declared at src/agent/psyche/trauma.js:23; writers=3, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:51.765Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "events-by-agent-63e338fd:write-rebuildFromGraph"
    description:
      zh: >
          写入方 rebuildFromGraph（src/agent/psyche/trauma.js）
          
      en: >
          writer rebuildFromGraph
          
  - protocol: rpc
    path: "events-by-agent-63e338fd:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/psyche/trauma.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "events-by-agent-63e338fd:write-save"
    description:
      zh: >
          写入方 save（src/agent/psyche/trauma.js）
          
      en: >
          writer save
          
  - protocol: rpc
    path: "events-by-agent-63e338fd:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "events-by-agent-63e338fd:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
  - protocol: rpc
    path: "events-by-agent-63e338fd:read-load"
    description:
      zh: >
          读取方 load
          
      en: >
          reader load
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:events-by-agent-63e338fd:read-__snapshot"
    label: {zh: "读 eventsByAgent", en: "read eventsByAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:events-by-agent-63e338fd:read-__restore"
    label: {zh: "读 eventsByAgent", en: "read eventsByAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.inventory.backpack
    from_api: "rpc:events-by-agent-63e338fd:read-load"
    label: {zh: "读 eventsByAgent", en: "read eventsByAgent"}
---
