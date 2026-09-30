---
uid: ac13af97
id: truman-town-flow.machines.list.survival-health-epidemic-f00806a3
parent: truman-town-flow.machines.list
name: {zh: "survival.health.epidemic(隔离)（自由 → 隔离中）", en: "survival.health.epidemic(隔离)"}
description:
  zh: >
      自由→隔离中：epidemic.quarantine()（疫情达阈值时对感染者）；隔离中→自由：epidemic.release()（已康复）。注意：曾长期是「只写不读」的装饰机制，且不幂等、只增不减；e63b932 修复
  en: >
      survival.health.epidemic(隔离) state machine with 2 transitions
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "survival-health-epidemic-f00806a3:t0_自由_to_隔离中"
    description:
      zh: >
          epidemic.quarantine()（疫情达阈值时对感染者） @src/survival/health/epidemic.js:70
      en: >
          epidemic.quarantine()（疫情达阈值时对感染者）
  - protocol: rpc
    path: "survival-health-epidemic-f00806a3:t1_隔离中_to_自由"
    description:
      zh: >
          epidemic.release()（已康复） @src/survival/health/epidemic.js:110
      en: >
          epidemic.release()（已康复）
---
