---
uid: 188ddc2a
id: truman-town-flow.state.area.infra.gen-3a5a94ca
parent: truman-town-flow.state.area.infra
name: {zh: "gen", en: "gen"}
description:
  zh: >
      expr 类型，声明于 src/infra/rng.js:34。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      expr declared at src/infra/rng.js:34; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
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
    path: "gen-3a5a94ca:read-next"
    description:
      zh: >
          读取方 next
          
      en: >
          reader next
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.identity
    from_api: "rpc:gen-3a5a94ca:read-next"
    label: {zh: "读 gen", en: "read gen"}
---
