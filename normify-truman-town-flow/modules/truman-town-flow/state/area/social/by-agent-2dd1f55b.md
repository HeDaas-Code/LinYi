---
uid: ecb39f12
id: truman-town-flow.state.area.social.by-agent-2dd1f55b
parent: truman-town-flow.state.area.social
name: {zh: "byAgent", en: "byAgent"}
description:
  zh: >
      map 类型，声明于 src/social/reputation.js:43。写入方 2 个、读取方 4 个；已纳入复位。
      
  en: >
      map declared at src/social/reputation.js:43; writers=2, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "by-agent-2dd1f55b:write-ensureFresh"
    description:
      zh: >
          写入方 ensureFresh（src/social/reputation.js）
          
      en: >
          writer ensureFresh
          
  - protocol: rpc
    path: "by-agent-2dd1f55b:write-update"
    description:
      zh: >
          写入方 update（src/social/reputation.js）
          
      en: >
          writer update
          
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
