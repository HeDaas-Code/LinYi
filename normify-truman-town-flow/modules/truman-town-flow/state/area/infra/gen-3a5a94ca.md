---
uid: 188ddc2a
id: truman-town-flow.state.area.infra.gen-3a5a94ca
parent: truman-town-flow.state.area.infra
name: {zh: "gen", en: "gen"}
description:
  zh: >
      expr 类型，声明于 src/infra/rng.js:51。写入方 2 个、读取方 4 个；已纳入复位。
      
  en: >
      expr declared at src/infra/rng.js:51; writers=2, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "gen-3a5a94ca:write-seed"
    description:
      zh: >
          写入方 seed（src/infra/rng.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "gen-3a5a94ca:write-__restore"
    description:
      zh: >
          写入方 __restore（src/infra/rng.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "gen-3a5a94ca:read-seed"
    description:
      zh: >
          读取方 seed
          
      en: >
          reader seed
          
  - protocol: rpc
    path: "gen-3a5a94ca:read-next"
    description:
      zh: >
          读取方 next
          
      en: >
          reader next
          
  - protocol: rpc
    path: "gen-3a5a94ca:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "gen-3a5a94ca:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.rng
    from_api: "rpc:gen-3a5a94ca:read-seed"
    label: {zh: "读 gen", en: "read gen"}
  - kind: dataflow
    to: truman-town-flow.code.infra.identity
    from_api: "rpc:gen-3a5a94ca:read-next"
    label: {zh: "读 gen", en: "read gen"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:gen-3a5a94ca:read-__snapshot"
    label: {zh: "读 gen", en: "read gen"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:gen-3a5a94ca:read-__restore"
    label: {zh: "读 gen", en: "read gen"}
---
