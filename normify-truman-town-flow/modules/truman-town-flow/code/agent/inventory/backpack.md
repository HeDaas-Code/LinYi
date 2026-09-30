---
uid: c715acba
id: truman-town-flow.code.agent.inventory.backpack
parent: truman-town-flow.code.agent.inventory
name: {zh: "agent/inventory/backpack.js", en: "agent/inventory/backpack.js"}
description:
  zh: >
      代码模块 src/agent/inventory/backpack.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/inventory/backpack.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:29.030Z"
fingerprint: 4a0a803365a05598621a0988bbfc7d82d0d77d3694227c139f2e5a29502036a4
source:
  - path: "src/agent/inventory/backpack.js"
apis:
  - protocol: rpc
    path: "agent.inventory.backpack.add"
    description:
      zh: >
          add：模块导出函数。
          
      en: >
          add: exported module function.
          
  - protocol: rpc
    path: "agent.inventory.backpack.remove"
    description:
      zh: >
          remove：模块导出函数。
          
      en: >
          remove: exported module function.
          
  - protocol: rpc
    path: "agent.inventory.backpack.list"
    description:
      zh: >
          list：模块导出函数。
          
      en: >
          list: exported module function.
          
  - protocol: rpc
    path: "agent.inventory.backpack.capacity"
    description:
      zh: >
          capacity：模块导出函数。
          
      en: >
          capacity: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.backpacks-19f4cfd5
    to_api: "rpc:backpacks-19f4cfd5:write-load"
    label: {zh: "写 backpacks", en: "write backpacks"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.residents-bf48cede
    to_api: "rpc:residents-bf48cede:write-load"
    label: {zh: "写 residents", en: "write residents"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.residents-99016ca8
    to_api: "rpc:residents-99016ca8:write-load"
    label: {zh: "写 residents", en: "write residents"}
---
