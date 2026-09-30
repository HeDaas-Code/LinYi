---
uid: f2cdde61
id: truman-town-flow.code.infra.config
parent: truman-town-flow.code.infra
name: {zh: "infra/config.js", en: "infra/config.js"}
description:
  zh: >
      代码模块 src/infra/config.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/infra/config.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:46.063Z"
fingerprint: 3e7f0509419ef296860cb861ef8cf1c9b69dd752fd1dcea4fae98ea4076236c5
source:
  - path: "src/infra/config.js"
apis:
  - protocol: rpc
    path: "infra.config.defaults"
    description:
      zh: >
          defaults：模块导出函数。
          
      en: >
          defaults: exported module function.
          
  - protocol: rpc
    path: "infra.config.difficultyIds"
    description:
      zh: >
          difficultyIds：模块导出函数。
          
      en: >
          difficultyIds: exported module function.
          
  - protocol: rpc
    path: "infra.config.difficultyPresets"
    description:
      zh: >
          difficultyPresets：模块导出函数。
          
      en: >
          difficultyPresets: exported module function.
          
  - protocol: rpc
    path: "infra.config.difficultyParams"
    description:
      zh: >
          difficultyParams：模块导出函数。
          
      en: >
          difficultyParams: exported module function.
          
  - protocol: rpc
    path: "infra.config.getDifficulty"
    description:
      zh: >
          getDifficulty：模块导出函数。
          
      en: >
          getDifficulty: exported module function.
          
  - protocol: rpc
    path: "infra.config.setDifficulty"
    description:
      zh: >
          setDifficulty：模块导出函数。
          
      en: >
          setDifficulty: exported module function.
          
  - protocol: rpc
    path: "infra.config.currentDifficultyParams"
    description:
      zh: >
          currentDifficultyParams：模块导出函数。
          
      en: >
          currentDifficultyParams: exported module function.
          
  - protocol: rpc
    path: "infra.config.validate"
    description:
      zh: >
          validate：模块导出函数。
          
      en: >
          validate: exported module function.
          
  - protocol: rpc
    path: "infra.config.resolve"
    description:
      zh: >
          resolve：模块导出函数。
          
      en: >
          resolve: exported module function.
          
  - protocol: rpc
    path: "infra.config.set"
    description:
      zh: >
          set：模块导出函数。
          
      en: >
          set: exported module function.
          
  - protocol: rpc
    path: "infra.config.setMany"
    description:
      zh: >
          setMany：模块导出函数。
          
      en: >
          setMany: exported module function.
          
  - protocol: rpc
    path: "infra.config.get"
    description:
      zh: >
          get：模块导出函数。
          
      en: >
          get: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.infra.current-difficulty-id-59939754
    to_api: "rpc:current-difficulty-id-59939754:write-setDifficulty"
    label: {zh: "写 currentDifficultyI", en: "write currentDifficultyI"}
---
