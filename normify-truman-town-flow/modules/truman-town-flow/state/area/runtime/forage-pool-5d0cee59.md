---
uid: 8bd652c0
id: truman-town-flow.state.area.runtime.forage-pool-5d0cee59
parent: truman-town-flow.state.area.runtime
name: {zh: "foragePool", en: "foragePool"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/loop.js:144。写入方 2 个、读取方 7 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/loop.js:144; writers=2, readers=7
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:42.543Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "forage-pool-5d0cee59:write-regenForagePool"
    description:
      zh: >
          写入方 regenForagePool（src/runtime/orchestrator/loop.js）
          
      en: >
          writer regenForagePool
          
  - protocol: rpc
    path: "forage-pool-5d0cee59:write-effectFor"
    description:
      zh: >
          写入方 effectFor（src/runtime/orchestrator/loop.js）
          
      en: >
          writer effectFor
          
  - protocol: rpc
    path: "forage-pool-5d0cee59:read-foragePoolCapacityOf"
    description:
      zh: >
          读取方 foragePoolCapacityOf
          
      en: >
          reader foragePoolCapacityOf
          
  - protocol: rpc
    path: "forage-pool-5d0cee59:read-regenForagePool"
    description:
      zh: >
          读取方 regenForagePool
          
      en: >
          reader regenForagePool
          
  - protocol: rpc
    path: "forage-pool-5d0cee59:read-foragePoolRemaining"
    description:
      zh: >
          读取方 foragePoolRemaining
          
      en: >
          reader foragePoolRemaining
          
  - protocol: rpc
    path: "forage-pool-5d0cee59:read-scheduleOverride"
    description:
      zh: >
          读取方 scheduleOverride
          
      en: >
          reader scheduleOverride
          
  - protocol: rpc
    path: "forage-pool-5d0cee59:read-decide"
    description:
      zh: >
          读取方 decide
          
      en: >
          reader decide
          
  - protocol: rpc
    path: "forage-pool-5d0cee59:read-effectFor"
    description:
      zh: >
          读取方 effectFor
          
      en: >
          reader effectFor
          
  - protocol: rpc
    path: "forage-pool-5d0cee59:read-syncWorldState"
    description:
      zh: >
          读取方 syncWorldState
          
      en: >
          reader syncWorldState
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:forage-pool-5d0cee59:read-foragePoolCapacityOf"
    label: {zh: "读 foragePool", en: "read foragePool"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:forage-pool-5d0cee59:read-regenForagePool"
    label: {zh: "读 foragePool", en: "read foragePool"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:forage-pool-5d0cee59:read-foragePoolRemaining"
    label: {zh: "读 foragePool", en: "read foragePool"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:forage-pool-5d0cee59:read-scheduleOverride"
    label: {zh: "读 foragePool", en: "read foragePool"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:forage-pool-5d0cee59:read-decide"
    label: {zh: "读 foragePool", en: "read foragePool"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:forage-pool-5d0cee59:read-effectFor"
    label: {zh: "读 foragePool", en: "read foragePool"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:forage-pool-5d0cee59:read-syncWorldState"
    label: {zh: "读 foragePool", en: "read foragePool"}
---
