---
uid: 8b78f7b3
id: truman-town-flow.state.area.agent.events-by-agent-63e338fd
parent: truman-town-flow.state.area.agent
name: {zh: "eventsByAgent", en: "eventsByAgent"}
description:
  zh: >
      map 类型，声明于 src/agent/psyche/trauma.js:23。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      map declared at src/agent/psyche/trauma.js:23; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:31.618Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "events-by-agent-63e338fd:write-ensureFresh"
    description:
      zh: >
          写入方 ensureFresh（src/agent/psyche/trauma.js）
          
      en: >
          writer ensureFresh
          
  - protocol: rpc
    path: "events-by-agent-63e338fd:write-save"
    description:
      zh: >
          写入方 save（src/agent/psyche/trauma.js）
          
      en: >
          writer save
          
  - protocol: rpc
    path: "events-by-agent-63e338fd:read-load"
    description:
      zh: >
          读取方 load
          
      en: >
          reader load
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.inventory.backpack
    from_api: "rpc:events-by-agent-63e338fd:read-load"
    label: {zh: "读 eventsByAgent", en: "read eventsByAgent"}
---
