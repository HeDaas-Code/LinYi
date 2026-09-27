---
uid: 13294c15
id: truman-town-flow.state.area.runtime.reproduced-pairs-73c79644
parent: truman-town-flow.state.area.runtime
name: {zh: "reproducedPairs", en: "reproducedPairs"}
description:
  zh: >
      set 类型，声明于 src/runtime/orchestrator/_stage2.js:86。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      set declared at src/runtime/orchestrator/_stage2.js:86; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.231Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "reproduced-pairs-73c79644:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "reproduced-pairs-73c79644:write-runProcreation"
    description:
      zh: >
          写入方 runProcreation（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runProcreation
          
  - protocol: rpc
    path: "reproduced-pairs-73c79644:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "reproduced-pairs-73c79644:read-runProcreation"
    description:
      zh: >
          读取方 runProcreation
          
      en: >
          reader runProcreation
          
  - protocol: rpc
    path: "reproduced-pairs-73c79644:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:reproduced-pairs-73c79644:read-runProcreation"
    label: {zh: "读 reproducedPairs", en: "read reproducedPairs"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:reproduced-pairs-73c79644:read-__snapshot"
    label: {zh: "读 reproducedPairs", en: "read reproducedPairs"}
---
