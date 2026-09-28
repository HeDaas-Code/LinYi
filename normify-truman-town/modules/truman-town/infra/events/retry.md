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
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.380Z"
fingerprint: 5f80d410f398d78226194ad2d4287e00c4191c4e7721b13518be35ca1568b2b6
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
