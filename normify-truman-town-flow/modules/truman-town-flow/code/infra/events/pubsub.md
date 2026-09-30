---
uid: 905342c3
id: truman-town-flow.code.infra.events.pubsub
parent: truman-town-flow.code.infra.events
name: {zh: "infra/events/pubsub.js", en: "infra/events/pubsub.js"}
description:
  zh: >
      代码模块 src/infra/events/pubsub.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/infra/events/pubsub.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:46.816Z"
fingerprint: fa5ae74ea49d2d08d06b797e27982b0f8820b2c0a0e2987f1dbf00ea44cfad24
source:
  - path: "src/infra/events/pubsub.js"
apis:
  - protocol: rpc
    path: "infra.events.pubsub.subscribe"
    description:
      zh: >
          subscribe：模块导出函数。
          
      en: >
          subscribe: exported module function.
          
  - protocol: rpc
    path: "infra.events.pubsub.publish"
    description:
      zh: >
          publish：模块导出函数。
          
      en: >
          publish: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.infra.handlers-f9a5ebb0
    to_api: "rpc:handlers-f9a5ebb0:write-subscribe"
    label: {zh: "写 handlers", en: "write handlers"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.wildcard-8d95c95f
    to_api: "rpc:wildcard-8d95c95f:write-subscribe"
    label: {zh: "写 wildcard", en: "write wildcard"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.by-id-fde1e42c
    to_api: "rpc:by-id-fde1e42c:write-publish"
    label: {zh: "写 byId", en: "write byId"}
---
