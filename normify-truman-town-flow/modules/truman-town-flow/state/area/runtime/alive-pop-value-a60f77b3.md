---
uid: 91bb9064
id: truman-town-flow.state.area.runtime.alive-pop-value-a60f77b3
parent: truman-town-flow.state.area.runtime
name: {zh: "_alivePopValue", en: "_alivePopValue"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/loop.js:157。写入方 1 个、读取方 1 个；**未纳入复位**（跨 run 可能残留）。
      
  en: >
      number declared at src/runtime/orchestrator/loop.js:157; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:42.543Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "alive-pop-value-a60f77b3:write-alivePopulation"
    description:
      zh: >
          写入方 alivePopulation（src/runtime/orchestrator/loop.js）
          
      en: >
          writer alivePopulation
          
  - protocol: rpc
    path: "alive-pop-value-a60f77b3:read-alivePopulation"
    description:
      zh: >
          读取方 alivePopulation
          
      en: >
          reader alivePopulation
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:alive-pop-value-a60f77b3:read-alivePopulation"
    label: {zh: "读 _alivePopValue", en: "read _alivePopValue"}
---
