---
uid: c13a600c
id: truman-town-flow.state.area.infra.dead-letters-5964bca1
parent: truman-town-flow.state.area.infra
name: {zh: "deadLetters", en: "deadLetters"}
description:
  zh: >
      array 类型，声明于 src/infra/events/retry.js:22。写入方 1 个、读取方 3 个；**未纳入复位**（跨 run 可能残留）。
  en: >
      array declared at src/infra/events/retry.js:22; writers=1, readers=3
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "dead-letters-5964bca1:write.run"
    description:
      zh: >
          写入方 run
      en: >
          writer run
  - protocol: rpc
    path: "dead-letters-5964bca1:read.run"
    description:
      zh: >
          读取方 run
      en: >
          reader run
  - protocol: rpc
    path: "dead-letters-5964bca1:read.dead"
    description:
      zh: >
          读取方 dead
      en: >
          reader dead
  - protocol: rpc
    path: "dead-letters-5964bca1:read.getStats"
    description:
      zh: >
          读取方 getStats
      en: >
          reader getStats
---
