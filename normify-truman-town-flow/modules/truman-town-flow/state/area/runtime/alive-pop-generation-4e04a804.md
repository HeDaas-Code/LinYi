---
uid: 6f7cc763
id: truman-town-flow.state.area.runtime.alive-pop-generation-4e04a804
parent: truman-town-flow.state.area.runtime
name: {zh: "_alivePopGeneration", en: "_alivePopGeneration"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/loop.js:156。写入方 2 个、读取方 1 个；**未纳入复位**（跨 run 可能残留）。
      
  en: >
      number declared at src/runtime/orchestrator/loop.js:156; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:42.543Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "alive-pop-generation-4e04a804:write-invalidateAlivePopulation"
    description:
      zh: >
          写入方 invalidateAlivePopulation（src/runtime/orchestrator/loop.js）
          
      en: >
          writer invalidateAlivePopulation
          
  - protocol: rpc
    path: "alive-pop-generation-4e04a804:write-alivePopulation"
    description:
      zh: >
          写入方 alivePopulation（src/runtime/orchestrator/loop.js）
          
      en: >
          writer alivePopulation
          
  - protocol: rpc
    path: "alive-pop-generation-4e04a804:read-alivePopulation"
    description:
      zh: >
          读取方 alivePopulation
          
      en: >
          reader alivePopulation
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:alive-pop-generation-4e04a804:read-alivePopulation"
    label: {zh: "读 _alivePopGeneratio", en: "read _alivePopGeneratio"}
---
