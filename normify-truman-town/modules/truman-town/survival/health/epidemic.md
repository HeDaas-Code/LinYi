---
uid: ea138a27
id: truman-town.survival.health.epidemic
parent: truman-town.survival.health
name: {zh: "疫情", en: "Epidemic"}
description:
  zh: >
      检测疫情并触发隔离、恐慌与互助行为。
      
  en: >
      Detects epidemics and triggers quarantine, panic and mutual aid.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T09:15:17.026Z"
fingerprint: 75ff1ab6a54bf72e83dffa1293b27017588678ee1d336d7d76ac03765e24a7bc
source:
  - path: "src/survival/health/epidemic.js"
apis:
  - protocol: rpc
    path: "survival.health.epidemic.detect"
    description:
      zh: >
          统计感染率并按阈值判定疫情，判定为疫情时写观察日志。
          
      en: >
          Counts the infection rate, flags an epidemic by threshold, and logs it when detected.
          
  - protocol: rpc
    path: "survival.health.epidemic.quarantine"
    description:
      zh: >
          隔离某居民并记录观察日志。
          
      en: >
          Quarantines a resident and records an observer log.
          
deps:
  - kind: call
    to: truman-town.survival.health.disease
  - kind: call
    to: truman-town.town.residence
  - kind: call
    to: truman-town.observer.recorder
---
