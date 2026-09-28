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
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:39.233Z"
fingerprint: ebea2d5fdd8850c70ed1e1e7f81a804465cf55c83ab394986da57b4efdb5ac98
source:
  - path: "src/civilization/tech/research.js"
apis:
  - protocol: rpc
    path: "civilization.tech.research.start"
    description:
      zh: >
          start：模块导出函数。
          
      en: >
          start: exported module function.
          
  - protocol: rpc
    path: "civilization.tech.research.progress"
    description:
      zh: >
          progress：模块导出函数。
          
      en: >
          progress: exported module function.
          
  - protocol: rpc
    path: "civilization.tech.research.complete"
    description:
      zh: >
          complete：模块导出函数。
          
      en: >
          complete: exported module function.
          
  - protocol: rpc
    path: "civilization.tech.research.reassign"
    description:
      zh: >
          reassign：模块导出函数。
          
      en: >
          reassign: exported module function.
          
  - protocol: rpc
    path: "civilization.tech.research.pending"
    description:
      zh: >
          pending：模块导出函数。
          
      en: >
          pending: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.civilization.active-b942d96b
    to_api: "rpc:active-b942d96b:write-complete"
    label: {zh: "写 active", en: "write active"}
---
