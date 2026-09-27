---
uid: 733c1ace
id: truman-town-flow.code.economy.tax
parent: truman-town-flow.code.economy
name: {zh: "economy/tax.js", en: "economy/tax.js"}
description:
  zh: >
      代码模块 src/economy/tax.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/economy/tax.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:20.282Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.last-collected-93b4b711
    to_api: "rpc:last-collected-93b4b711:write-collect"
    label: {zh: "写 lastCollected", en: "write lastCollected"}
---
