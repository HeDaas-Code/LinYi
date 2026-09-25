---
uid: 226eb5a7
id: truman-town-flow.state.area.infra.current-difficulty-id-59939754
parent: truman-town-flow.state.area.infra
name: {zh: "currentDifficultyId", en: "currentDifficultyId"}
description:
  zh: >
      string 类型，声明于 src/infra/config.js:261。写入方 1 个、读取方 2 个；已纳入复位。
  en: >
      string declared at src/infra/config.js:261; writers=1, readers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "current-difficulty-id-59939754:write.setDifficulty"
    description:
      zh: >
          写入方 setDifficulty
      en: >
          writer setDifficulty
  - protocol: rpc
    path: "current-difficulty-id-59939754:read.getDifficulty"
    description:
      zh: >
          读取方 getDifficulty
      en: >
          reader getDifficulty
  - protocol: rpc
    path: "current-difficulty-id-59939754:read.currentDifficultyParams"
    description:
      zh: >
          读取方 currentDifficultyParams
      en: >
          reader currentDifficultyParams
---
