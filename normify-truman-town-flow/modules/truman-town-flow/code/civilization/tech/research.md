---
uid: cd89002f
id: truman-town-flow.code.civilization.tech.research
parent: truman-town-flow.code.civilization.tech
name: {zh: "civilization/tech/research.js", en: "civilization/tech/research.js"}
description:
  zh: >
      代码模块 src/civilization/tech/research.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/civilization/tech/research.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:20.282Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.civilization.active-b942d96b
    to_api: "rpc:active-b942d96b:write-complete"
    label: {zh: "写 active", en: "write active"}
---
