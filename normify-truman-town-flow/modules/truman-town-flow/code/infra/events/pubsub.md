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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:20.282Z"
fingerprint: pending
source: []
apis: []
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
