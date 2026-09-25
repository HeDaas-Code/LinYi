---
uid: f490d8f2
id: truman-town-flow.state.area.runtime.laya-urgency-cache-41855253
parent: truman-town-flow.state.area.runtime
name: {zh: "layaUrgencyCache", en: "layaUrgencyCache"}
description:
  zh: >
      map 类型，声明于 src/runtime/orchestrator/loop.js:68。写入方 2 个、读取方 2 个；**未纳入复位**（跨 run 可能残留）。
  en: >
      map declared at src/runtime/orchestrator/loop.js:68; writers=2, readers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "laya-urgency-cache-41855253:write.prefetchLayaUrgency"
    description:
      zh: >
          写入方 prefetchLayaUrgency
      en: >
          writer prefetchLayaUrgency
  - protocol: rpc
    path: "laya-urgency-cache-41855253:write.step"
    description:
      zh: >
          写入方 step
      en: >
          writer step
  - protocol: rpc
    path: "laya-urgency-cache-41855253:read.layaUrgencyFor"
    description:
      zh: >
          读取方 layaUrgencyFor
      en: >
          reader layaUrgencyFor
  - protocol: rpc
    path: "laya-urgency-cache-41855253:read.step"
    description:
      zh: >
          读取方 step
      en: >
          reader step
---
