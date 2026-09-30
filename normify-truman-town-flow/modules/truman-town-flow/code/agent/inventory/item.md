---
uid: 0062d18b
id: truman-town-flow.code.agent.inventory.item
parent: truman-town-flow.code.agent.inventory
name: {zh: "agent/inventory/item.js", en: "agent/inventory/item.js"}
description:
  zh: >
      代码模块 src/agent/inventory/item.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/inventory/item.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:29.727Z"
fingerprint: 1c9ccd05043b6746fb6c7296c18ea15e8222752be592891549897a4eb787540f
source:
  - path: "src/agent/inventory/item.js"
apis:
  - protocol: rpc
    path: "agent.inventory.item.define"
    description:
      zh: >
          define：模块导出函数。
          
      en: >
          define: exported module function.
          
  - protocol: rpc
    path: "agent.inventory.item.query"
    description:
      zh: >
          query：模块导出函数。
          
      en: >
          query: exported module function.
          
---
