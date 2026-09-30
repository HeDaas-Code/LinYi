---
uid: a70530a5
id: truman-town-flow.code.survival.needs.meter
parent: truman-town-flow.code.survival.needs
name: {zh: "survival/needs/meter.js", en: "survival/needs/meter.js"}
description:
  zh: >
      代码模块 src/survival/needs/meter.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/survival/needs/meter.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:36:06.638Z"
fingerprint: a5bbfb742857742921378ec6ac37b01ea132309698688eeebe77391a0ea5ec5f
source:
  - path: "src/survival/needs/meter.js"
apis:
  - protocol: rpc
    path: "survival.needs.meter.update"
    description:
      zh: >
          update：模块导出函数。
          
      en: >
          update: exported module function.
          
  - protocol: rpc
    path: "survival.needs.meter.query"
    description:
      zh: >
          query：模块导出函数。
          
      en: >
          query: exported module function.
          
---
