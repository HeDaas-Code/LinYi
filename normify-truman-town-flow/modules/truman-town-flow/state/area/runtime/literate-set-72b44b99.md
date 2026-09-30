---
uid: 253cd693
id: truman-town-flow.state.area.runtime.literate-set-72b44b99
parent: truman-town-flow.state.area.runtime
name: {zh: "literateSet", en: "literateSet"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/loop.js:806。写入方 2 个、读取方 4 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/loop.js:806; writers=2, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "literate-set-72b44b99:write-computeLiterateSet"
    description:
      zh: >
          写入方 computeLiterateSet（src/runtime/orchestrator/loop.js）
          
      en: >
          writer computeLiterateSet
          
  - protocol: rpc
    path: "literate-set-72b44b99:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/loop.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "literate-set-72b44b99:read-computeLiterateSet"
    description:
      zh: >
          读取方 computeLiterateSet
          
      en: >
          reader computeLiterateSet
          
  - protocol: rpc
    path: "literate-set-72b44b99:read-isLiterate"
    description:
      zh: >
          读取方 isLiterate
          
      en: >
          reader isLiterate
          
  - protocol: rpc
    path: "literate-set-72b44b99:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "literate-set-72b44b99:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:literate-set-72b44b99:read-computeLiterateSet"
    label: {zh: "读 literateSet", en: "read literateSet"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:literate-set-72b44b99:read-isLiterate"
    label: {zh: "读 literateSet", en: "read literateSet"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:literate-set-72b44b99:read-__snapshot"
    label: {zh: "读 literateSet", en: "read literateSet"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:literate-set-72b44b99:read-__restore"
    label: {zh: "读 literateSet", en: "read literateSet"}
---
