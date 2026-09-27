---
uid: 3c59a96a
id: truman-town-flow.state.area.civilization.active-b942d96b
parent: truman-town-flow.state.area.civilization
name: {zh: "active", en: "active"}
description:
  zh: >
      map 类型，声明于 src/civilization/tech/research.js:20。写入方 3 个、读取方 6 个；已纳入复位。
      
  en: >
      map declared at src/civilization/tech/research.js:20; writers=3, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:51.765Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "active-b942d96b:write-start"
    description:
      zh: >
          写入方 start（src/civilization/tech/research.js）
          
      en: >
          writer start
          
  - protocol: rpc
    path: "active-b942d96b:write-complete"
    description:
      zh: >
          写入方 complete（src/civilization/tech/research.js）
          
      en: >
          writer complete
          
  - protocol: rpc
    path: "active-b942d96b:write-__restore"
    description:
      zh: >
          写入方 __restore（src/civilization/tech/research.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "active-b942d96b:read-start"
    description:
      zh: >
          读取方 start
          
      en: >
          reader start
          
  - protocol: rpc
    path: "active-b942d96b:read-progress"
    description:
      zh: >
          读取方 progress
          
      en: >
          reader progress
          
  - protocol: rpc
    path: "active-b942d96b:read-complete"
    description:
      zh: >
          读取方 complete
          
      en: >
          reader complete
          
  - protocol: rpc
    path: "active-b942d96b:read-pending"
    description:
      zh: >
          读取方 pending
          
      en: >
          reader pending
          
  - protocol: rpc
    path: "active-b942d96b:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "active-b942d96b:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.api.control
    from_api: "rpc:active-b942d96b:read-start"
    label: {zh: "读 active", en: "read active"}
  - kind: dataflow
    to: truman-town-flow.code.civilization.tech.research
    from_api: "rpc:active-b942d96b:read-progress"
    label: {zh: "读 active", en: "read active"}
  - kind: dataflow
    to: truman-town-flow.code.civilization.tech.research
    from_api: "rpc:active-b942d96b:read-complete"
    label: {zh: "读 active", en: "read active"}
  - kind: dataflow
    to: truman-town-flow.code.civilization.tech.research
    from_api: "rpc:active-b942d96b:read-pending"
    label: {zh: "读 active", en: "read active"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:active-b942d96b:read-__snapshot"
    label: {zh: "读 active", en: "read active"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:active-b942d96b:read-__restore"
    label: {zh: "读 active", en: "read active"}
---
