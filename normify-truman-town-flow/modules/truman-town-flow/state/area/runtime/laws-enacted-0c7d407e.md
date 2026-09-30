---
uid: a61e04d7
id: truman-town-flow.state.area.runtime.laws-enacted-0c7d407e
parent: truman-town-flow.state.area.runtime
name: {zh: "lawsEnacted", en: "lawsEnacted"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:33。写入方 3 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:33; writers=3, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:08.999Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "laws-enacted-0c7d407e:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "laws-enacted-0c7d407e:write-runPolitics"
    description:
      zh: >
          写入方 runPolitics（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runPolitics
          
  - protocol: rpc
    path: "laws-enacted-0c7d407e:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "laws-enacted-0c7d407e:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "laws-enacted-0c7d407e:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "laws-enacted-0c7d407e:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:laws-enacted-0c7d407e:read-summary"
    label: {zh: "读 lawsEnacted", en: "read lawsEnacted"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:laws-enacted-0c7d407e:read-__snapshot"
    label: {zh: "读 lawsEnacted", en: "read lawsEnacted"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:laws-enacted-0c7d407e:read-__restore"
    label: {zh: "读 lawsEnacted", en: "read lawsEnacted"}
---
