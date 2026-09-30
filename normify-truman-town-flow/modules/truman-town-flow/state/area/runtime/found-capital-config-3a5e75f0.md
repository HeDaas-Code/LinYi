---
uid: "703788e3"
id: truman-town-flow.state.area.runtime.found-capital-config-3a5e75f0
parent: truman-town-flow.state.area.runtime
name: {zh: "foundCapitalConfig", en: "foundCapitalConfig"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage2.js:905。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage2.js:905; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.639Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "found-capital-config-3a5e75f0:write-setFoundConfig"
    description:
      zh: >
          写入方 setFoundConfig（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer setFoundConfig
          
  - protocol: rpc
    path: "found-capital-config-3a5e75f0:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "found-capital-config-3a5e75f0:read-foundCapitalOf"
    description:
      zh: >
          读取方 foundCapitalOf
          
      en: >
          reader foundCapitalOf
          
  - protocol: rpc
    path: "found-capital-config-3a5e75f0:read-cfgVal"
    description:
      zh: >
          读取方 cfgVal
          
      en: >
          reader cfgVal
          
  - protocol: rpc
    path: "found-capital-config-3a5e75f0:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:found-capital-config-3a5e75f0:read-foundCapitalOf"
    label: {zh: "读 foundCapitalConfig", en: "read foundCapitalConfig"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:found-capital-config-3a5e75f0:read-cfgVal"
    label: {zh: "读 foundCapitalConfig", en: "read foundCapitalConfig"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:found-capital-config-3a5e75f0:read-__snapshot"
    label: {zh: "读 foundCapitalConfig", en: "read foundCapitalConfig"}
---
