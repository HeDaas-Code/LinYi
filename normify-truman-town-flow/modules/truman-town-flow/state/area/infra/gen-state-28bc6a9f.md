---
uid: f129e7c6
id: truman-town-flow.state.area.infra.gen-state-28bc6a9f
parent: truman-town-flow.state.area.infra
name: {zh: "genState", en: "genState"}
description:
  zh: >
      expr 类型，声明于 src/infra/rng.js:50。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      expr declared at src/infra/rng.js:50; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "gen-state-28bc6a9f:write-seed"
    description:
      zh: >
          写入方 seed（src/infra/rng.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "gen-state-28bc6a9f:write-__restore"
    description:
      zh: >
          写入方 __restore（src/infra/rng.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "gen-state-28bc6a9f:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "gen-state-28bc6a9f:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:gen-state-28bc6a9f:read-__snapshot"
    label: {zh: "读 genState", en: "read genState"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:gen-state-28bc6a9f:read-__restore"
    label: {zh: "读 genState", en: "read genState"}
---
