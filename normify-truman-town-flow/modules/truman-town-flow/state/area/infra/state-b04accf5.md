---
uid: 257188b6
id: truman-town-flow.state.area.infra.state-b04accf5
parent: truman-town-flow.state.area.infra
name: {zh: "state", en: "state"}
description:
  zh: >
      number 类型，声明于 src/infra/rng.js:9。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/infra/rng.js:9; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "state-b04accf5:write-seed"
    description:
      zh: >
          写入方 seed（src/infra/rng.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "state-b04accf5:read-seed"
    description:
      zh: >
          读取方 seed
          
      en: >
          reader seed
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.rng
    from_api: "rpc:state-b04accf5:read-seed"
    label: {zh: "读 state", en: "read state"}
---
