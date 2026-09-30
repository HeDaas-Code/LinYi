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
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:48.485Z"
fingerprint: a9df5585e710e1c2fd2b96b4f81682b08e41c68060fb77f0d8595da54954daea
source:
  - path: "src/infra/identity.js"
apis:
  - protocol: rpc
    path: "infra.identity.next"
    description:
      zh: >
          next：模块导出函数。
          
      en: >
          next: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.infra.counter-d8b78ddd
    to_api: "rpc:counter-d8b78ddd:write-next"
    label: {zh: "写 counter", en: "write counter"}
---
