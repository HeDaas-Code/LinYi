---
uid: 226eb5a7
id: truman-town-flow.state.area.infra.current-difficulty-id-59939754
parent: truman-town-flow.state.area.infra
name: {zh: "currentDifficultyId", en: "currentDifficultyId"}
description:
  zh: >
      string 类型，声明于 src/infra/config.js:291。写入方 2 个、读取方 4 个；已纳入复位。
      
  en: >
      string declared at src/infra/config.js:291; writers=2, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "current-difficulty-id-59939754:write-setDifficulty"
    description:
      zh: >
          写入方 setDifficulty（src/infra/config.js）
          
      en: >
          writer setDifficulty
          
  - protocol: rpc
    path: "current-difficulty-id-59939754:write-__restore"
    description:
      zh: >
          写入方 __restore（src/infra/config.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "current-difficulty-id-59939754:read-getDifficulty"
    description:
      zh: >
          读取方 getDifficulty
          
      en: >
          reader getDifficulty
          
  - protocol: rpc
    path: "current-difficulty-id-59939754:read-currentDifficultyParams"
    description:
      zh: >
          读取方 currentDifficultyParams
          
      en: >
          reader currentDifficultyParams
          
  - protocol: rpc
    path: "current-difficulty-id-59939754:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "current-difficulty-id-59939754:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.config
    from_api: "rpc:current-difficulty-id-59939754:read-getDifficulty"
    label: {zh: "读 currentDifficultyI", en: "read currentDifficultyI"}
  - kind: dataflow
    to: truman-town-flow.code.infra.config
    from_api: "rpc:current-difficulty-id-59939754:read-currentDifficultyParams"
    label: {zh: "读 currentDifficultyI", en: "read currentDifficultyI"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:current-difficulty-id-59939754:read-__snapshot"
    label: {zh: "读 currentDifficultyI", en: "read currentDifficultyI"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:current-difficulty-id-59939754:read-__restore"
    label: {zh: "读 currentDifficultyI", en: "read currentDifficultyI"}
---
