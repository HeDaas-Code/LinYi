---
uid: e0cd0f17
id: truman-town-flow.machines.list.industry-business-2aac9fd5
parent: truman-town-flow.machines.list
name: {zh: "industry.business（active → insolvent → closed）", en: "industry.business"}
description:
  zh: >
      不存在→active：bootstrapBusinesses（**固定路径，非涌现**）；active→insolvent：business.insolvent（余额不足）；active→closed：business.closed。注意：已知缺口：创办走固定路径，三家种子 businesses 恒为 2。需实现居民驱动的 found/invest
  en: >
      industry.business state machine with 3 transitions
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "industry-business-2aac9fd5:t0_不存在_to_active"
    description:
      zh: >
          bootstrapBusinesses（**固定路径，非涌现**） @src/runtime/orchestrator/_stage2.js
      en: >
          bootstrapBusinesses（**固定路径，非涌现**）
  - protocol: rpc
    path: "industry-business-2aac9fd5:t1_active_to_insolvent"
    description:
      zh: >
          business.insolvent（余额不足） @src/economy/industry/business.js:124
      en: >
          business.insolvent（余额不足）
  - protocol: rpc
    path: "industry-business-2aac9fd5:t2_active_to_closed"
    description:
      zh: >
          business.closed @src/economy/industry/business.js:151
      en: >
          business.closed
---
