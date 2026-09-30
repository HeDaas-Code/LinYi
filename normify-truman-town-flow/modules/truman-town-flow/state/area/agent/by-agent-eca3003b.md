---
uid: 9f1ae99a
id: truman-town-flow.state.area.agent.by-agent-eca3003b
parent: truman-town-flow.state.area.agent
name: {zh: "byAgent", en: "byAgent"}
description:
  zh: >
      map 类型，声明于 src/agent/memory/semantic.js:21。写入方 3 个、读取方 6 个；已纳入复位。
      
  en: >
      map declared at src/agent/memory/semantic.js:21; writers=3, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "by-agent-eca3003b:write-rebuildFromGraph"
    description:
      zh: >
          写入方 rebuildFromGraph（src/agent/memory/semantic.js）
          
      en: >
          writer rebuildFromGraph
          
  - protocol: rpc
    path: "by-agent-eca3003b:write-store"
    description:
      zh: >
          写入方 store（src/agent/memory/semantic.js）
          
      en: >
          writer store
          
  - protocol: rpc
    path: "by-agent-eca3003b:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/memory/semantic.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "by-agent-eca3003b:read-rebuildFromGraph"
    description:
      zh: >
          读取方 rebuildFromGraph
          
      en: >
          reader rebuildFromGraph
          
  - protocol: rpc
    path: "by-agent-eca3003b:read-store"
    description:
      zh: >
          读取方 store
          
      en: >
          reader store
          
  - protocol: rpc
    path: "by-agent-eca3003b:read-list"
    description:
      zh: >
          读取方 list
          
      en: >
          reader list
          
  - protocol: rpc
    path: "by-agent-eca3003b:read-recall"
    description:
      zh: >
          读取方 recall
          
      en: >
          reader recall
          
  - protocol: rpc
    path: "by-agent-eca3003b:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "by-agent-eca3003b:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-agent-eca3003b:read-rebuildFromGraph"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.semantic
    from_api: "rpc:by-agent-eca3003b:read-store"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-agent-eca3003b:read-list"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.semantic
    from_api: "rpc:by-agent-eca3003b:read-recall"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:by-agent-eca3003b:read-__snapshot"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:by-agent-eca3003b:read-__restore"
    label: {zh: "读 byAgent", en: "read byAgent"}
---
