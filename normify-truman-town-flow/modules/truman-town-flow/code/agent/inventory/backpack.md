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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis: []
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
