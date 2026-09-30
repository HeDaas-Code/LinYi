---
uid: 11780c14
id: truman-town-flow.state.area.runtime.item-ids-ac5f662d
parent: truman-town-flow.state.area.runtime
name: {zh: "itemIds", en: "itemIds"}
description:
  zh: >
      object 类型，声明于 src/runtime/orchestrator/_stage2.js:89。写入方 2 个、读取方 5 个；已纳入复位。
      
  en: >
      object declared at src/runtime/orchestrator/_stage2.js:89; writers=2, readers=5
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "item-ids-ac5f662d:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "item-ids-ac5f662d:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "item-ids-ac5f662d:read-seed"
    description:
      zh: >
          读取方 seed
          
      en: >
          reader seed
          
  - protocol: rpc
    path: "item-ids-ac5f662d:read-craftMaterialId"
    description:
      zh: >
          读取方 craftMaterialId
          
      en: >
          reader craftMaterialId
          
  - protocol: rpc
    path: "item-ids-ac5f662d:read-candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
          
      en: >
          reader candidateStateFor
          
  - protocol: rpc
    path: "item-ids-ac5f662d:read-performAgentAction"
    description:
      zh: >
          读取方 performAgentAction
          
      en: >
          reader performAgentAction
          
  - protocol: rpc
    path: "item-ids-ac5f662d:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.rng
    from_api: "rpc:item-ids-ac5f662d:read-seed"
    label: {zh: "读 itemIds", en: "read itemIds"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:item-ids-ac5f662d:read-craftMaterialId"
    label: {zh: "读 itemIds", en: "read itemIds"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:item-ids-ac5f662d:read-candidateStateFor"
    label: {zh: "读 itemIds", en: "read itemIds"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:item-ids-ac5f662d:read-performAgentAction"
    label: {zh: "读 itemIds", en: "read itemIds"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:item-ids-ac5f662d:read-__snapshot"
    label: {zh: "读 itemIds", en: "read itemIds"}
---
