---
uid: 5b2c134d
id: truman-town-flow.code.infra.identity
parent: truman-town-flow.code.infra
name: {zh: "infra/identity.js", en: "infra/identity.js"}
description:
  zh: >
      代码模块 src/infra/identity.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/infra/identity.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:46.551Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.infra.counter-d8b78ddd
    to_api: "rpc:counter-d8b78ddd:write-next"
    label: {zh: "写 counter", en: "write counter"}
---
