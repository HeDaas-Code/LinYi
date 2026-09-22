---
uid: bfc98f00
id: truman-town.infra.events.retry
parent: truman-town.infra.events
state: planned
name: {zh: "事件重试", en: "Event Retry"}
description:
  zh: >
      对失败事件入队重试与死信处理。
  en: >
      Retries failed events and handles dead letters.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
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
