---
uid: 5ca518d6
id: truman-town.infra.events.pubsub
parent: truman-town.infra.events
name: {zh: "发布订阅", en: "Pub/Sub"}
description:
  zh: >
      发布与订阅沙盘事件。
      
  en: >
      Publishes and subscribes to sandbox events.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:45:38.726Z"
fingerprint: fa5ae74ea49d2d08d06b797e27982b0f8820b2c0a0e2987f1dbf00ea44cfad24
source:
  - path: "src/infra/events/pubsub.js"
apis:
  - protocol: rpc
    path: "infra.events.pubsub.publish"
    description:
      zh: >
          向主题派发事件，同步调用全部匹配订阅者。
          
      en: >
          Publishes an event to a topic, synchronously invoking all matching subscribers.
          
  - protocol: rpc
    path: "infra.events.pubsub.subscribe"
    description:
      zh: >
          订阅主题并返回取消订阅函数；topic "*" 订阅全部。
          
      en: >
          Subscribes to a topic and returns an unsubscribe function; topic "*" matches all.
          
---
