---
uid: cc703404
id: truman-town.survival.events.impact
parent: truman-town.survival.events
name: {zh: "事件影响", en: "Event Impact"}
description:
  zh: >
      把突发事件施加到避难所、资源与居民，并解决事件链。
      
  en: >
      Applies events to shelter, resources and residents, and resolves event chains.
      
revision: da6092c786d6c0615331ed8d297d5c0d6a2fa45a
updated_at: "2026-09-23T12:13:27.593Z"
fingerprint: 1a7d089c20b1cb320b529173ea88bf49a730dfdbf79638f01938fc782d75d677
source:
  - path: "src/survival/events/impact.js"
apis:
  - protocol: rpc
    path: "survival.events.impact.apply"
    description:
      zh: >
          把单个突发事件施加到避难所、资源并记录事件日志。
          
      en: >
          Applies a single event to shelter/resources and records it to the event log.
          
  - protocol: rpc
    path: "survival.events.impact.resolve"
    description:
      zh: >
          解决突发事件及其事件链，返回完整影响结果。
          
      en: >
          Resolves events and their chains, returning the full impact results.
          
deps:
  - kind: call
    to: truman-town.survival.shelter
  - kind: call
    to: truman-town.survival.resources.food
  - kind: call
    to: truman-town.observer.recorder
---
