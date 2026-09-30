---
uid: 257188b6
id: truman-town-flow.state.area.infra.state-b04accf5
parent: truman-town-flow.state.area.infra
name: {zh: "state", en: "state"}
description:
  zh: >
      number 类型，声明于 src/infra/rng.js:11。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/infra/rng.js:11; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
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
    path: "state-b04accf5:write-__restore"
    description:
      zh: >
          写入方 __restore（src/infra/rng.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "state-b04accf5:read-seed"
    description:
      zh: >
          读取方 seed
          
      en: >
          reader seed
          
  - protocol: rpc
    path: "state-b04accf5:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "state-b04accf5:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.rng
    from_api: "rpc:state-b04accf5:read-seed"
    label: {zh: "读 state", en: "read state"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:state-b04accf5:read-__snapshot"
    label: {zh: "读 state", en: "read state"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:state-b04accf5:read-__restore"
    label: {zh: "读 state", en: "read state"}
---
