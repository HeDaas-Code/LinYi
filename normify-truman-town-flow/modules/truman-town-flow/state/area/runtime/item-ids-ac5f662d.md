---
uid: 11780c14
id: truman-town-flow.state.area.runtime.item-ids-ac5f662d
parent: truman-town-flow.state.area.runtime
name: {zh: "itemIds", en: "itemIds"}
description:
  zh: >
      object 类型，声明于 src/runtime/orchestrator/_stage2.js:79。写入方 1 个、读取方 3 个；已纳入复位。
      
  en: >
      object declared at src/runtime/orchestrator/_stage2.js:79; writers=1, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:36.897Z"
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
    path: "item-ids-ac5f662d:read-performAgentAction"
    description:
      zh: >
          读取方 performAgentAction
          
      en: >
          reader performAgentAction
          
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
    from_api: "rpc:item-ids-ac5f662d:read-performAgentAction"
    label: {zh: "读 itemIds", en: "read itemIds"}
---
