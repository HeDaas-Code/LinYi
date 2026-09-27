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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:20.282Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.infra.current-difficulty-id-59939754
    to_api: "rpc:current-difficulty-id-59939754:write-setDifficulty"
    label: {zh: "写 currentDifficultyI", en: "write currentDifficultyI"}
---
