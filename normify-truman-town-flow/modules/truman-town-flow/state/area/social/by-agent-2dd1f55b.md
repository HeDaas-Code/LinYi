---
uid: ecb39f12
id: truman-town-flow.state.area.social.by-agent-2dd1f55b
parent: truman-town-flow.state.area.social
name: {zh: "byAgent", en: "byAgent"}
description:
  zh: >
      map 类型，声明于 src/social/reputation.js:43。写入方 3 个、读取方 6 个；已纳入复位。
      
  en: >
      map declared at src/social/reputation.js:43; writers=3, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "by-agent-2dd1f55b:write-rebuildFromGraph"
    description:
      zh: >
          写入方 rebuildFromGraph（src/social/reputation.js）
          
      en: >
          writer rebuildFromGraph
          
  - protocol: rpc
    path: "by-agent-2dd1f55b:write-__restore"
    description:
      zh: >
          写入方 __restore（src/social/reputation.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "by-agent-2dd1f55b:write-update"
    description:
      zh: >
          写入方 update（src/social/reputation.js）
          
      en: >
          writer update
          
  - protocol: rpc
    path: "by-agent-2dd1f55b:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "by-agent-2dd1f55b:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
  - protocol: rpc
    path: "by-agent-2dd1f55b:read-update"
    description:
      zh: >
          读取方 update
          
      en: >
          reader update
          
  - protocol: rpc
    path: "by-agent-2dd1f55b:read-query"
    description:
      zh: >
          读取方 query
          
      en: >
          reader query
          
  - protocol: rpc
    path: "by-agent-2dd1f55b:read-list"
    description:
      zh: >
          读取方 list
          
      en: >
          reader list
          
  - protocol: rpc
    path: "by-agent-2dd1f55b:read-scoreMap"
    description:
      zh: >
          读取方 scoreMap
          
      en: >
          reader scoreMap
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:by-agent-2dd1f55b:read-__snapshot"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:by-agent-2dd1f55b:read-__restore"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.economy.market.price
    from_api: "rpc:by-agent-2dd1f55b:read-update"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:by-agent-2dd1f55b:read-query"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-agent-2dd1f55b:read-list"
    label: {zh: "读 byAgent", en: "read byAgent"}
  - kind: dataflow
    to: truman-town-flow.code.social.reputation
    from_api: "rpc:by-agent-2dd1f55b:read-scoreMap"
    label: {zh: "读 byAgent", en: "read byAgent"}
---
