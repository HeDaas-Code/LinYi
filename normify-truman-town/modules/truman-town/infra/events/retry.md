---
uid: bfc98f00
id: truman-town.infra.events.retry
parent: truman-town.infra.events
name: {zh: "事件重试", en: "Event Retry"}
description:
  zh: >
      对失败事件入队重试与死信处理。
      
  en: >
      Retries failed events and handles dead letters.
      
revision: 36ce55d9e3d8994abf455c13925f0c4f4a3f316c
updated_at: "2026-09-25T09:50:41.310Z"
fingerprint: 621b51f786b470749be1dd74b2e7abe5551efeefd54fff86a396849da8a8cd16
source:
  - path: "src/infra/events/retry.js"
apis:
  - protocol: rpc
    path: "infra.events.retry.enqueue"
    description:
      zh: >
          调用 infra.events.retry.enqueue。
          
      en: >
          Calls infra.events.retry.enqueue.
          
  - protocol: rpc
    path: "infra.events.retry.run"
    description:
      zh: >
          调用 infra.events.retry.run。
          
      en: >
          Calls infra.events.retry.run.
          
deps:
  - kind: call
    to: truman-town.infra.events.pubsub
---
