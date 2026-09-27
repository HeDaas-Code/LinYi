---
uid: 691cfc1c
id: truman-town-flow.state.area.agent.by-agent-86ec5f42
parent: truman-town-flow.state.area.agent
name: {zh: "byAgent", en: "byAgent"}
description:
  zh: >
      map 类型，声明于 src/agent/memory/episodic/store.js:22。写入方 3 个、读取方 7 个；已纳入复位。
      
  en: >
      map declared at src/agent/memory/episodic/store.js:22; writers=3, readers=7
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "by-agent-86ec5f42:write-rebuildFromGraph"
    description:
      zh: >
          写入方 rebuildFromGraph（src/agent/memory/episodic/store.js）
          
      en: >
          writer rebuildFromGraph
          
  - protocol: rpc
    path: "by-agent-86ec5f42:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/memory/episodic/store.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "by-agent-86ec5f42:write-write"
    description:
      zh: >
          写入方 write（src/agent/memory/episodic/store.js）
          
      en: >
          writer write
          
  - protocol: rpc
    path: "by-agent-86ec5f42:read-rebuildFromGraph"
    description:
      zh: >
          读取方 rebuildFromGraph
          
      en: >
          reader rebuildFromGraph
          
  - protocol: rpc
    path: "by-agent-86ec5f42:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "by-agent-86ec5f42:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
  - protocol: rpc
    path: "by-agent-86ec5f42:read-write"
    description:
      zh: >
          读取方 write
          
      en: >
          reader write
          
  - protocol: rpc
    path: "by-agent-86ec5f42:read-tag"
    description:
      zh: >
          读取方 tag
          
      en: >
          reader tag
          
  - protocol: rpc
    path: "by-agent-86ec5f42:read-list"
    description:
      zh: >
          读取方 list
          
      en: >
          reader list
          
  - protocol: rpc
    path: "by-agent-86ec5f42:read-_rawList"
    description:
      zh: >
          读取方 _rawList
          
      en: >
          reader _rawList
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-agent-86ec5f42:read-rebuildFromGraph"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:by-agent-86ec5f42:read-__snapshot"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:by-agent-86ec5f42:read-__restore"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-agent-86ec5f42:read-write"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-agent-86ec5f42:read-tag"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-agent-86ec5f42:read-list"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-agent-86ec5f42:read-_rawList"
    label: {zh: "读 byAgent", en: "read byAgent"}
---
