---
uid: 17c44ce3
id: truman-town-flow.code.survival.environment.radiation
parent: truman-town-flow.code.survival.environment
name: {zh: "survival/environment/radiation.js", en: "survival/environment/radiation.js"}
description:
  zh: >
      代码模块 src/survival/environment/radiation.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/survival/environment/radiation.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:48.777Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.survival.grid-82f106b5
    to_api: "rpc:grid-82f106b5:write-generate"
    label: {zh: "写 grid", en: "write grid"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.grid-82f106b5
    to_api: "rpc:grid-82f106b5:write-spread"
    label: {zh: "写 grid", en: "write grid"}
---
