---
uid: 3d781f88
id: truman-town-flow.diagnostics.store-never-read-b838b496
parent: truman-town-flow.diagnostics
name: {zh: "store/never-read（2）", en: "store/never-read (2)"}
description:
  zh: >
      infra.rng.seeded @src/infra/rng.js:10；runtime.orchestrator.dispatch.lastApplied @src/runtime/orchestrator/dispatch.js:13
  en: >
      store/never-read findings: 2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "store-never-read-b838b496:store/never-read.0"
    description:
      zh: >
          infra.rng.seeded — 被 1 处写入（seed）但无任何函数读取：状态不产生行为后果
      en: >
          infra.rng.seeded
  - protocol: rpc
    path: "store-never-read-b838b496:store/never-read.1"
    description:
      zh: >
          runtime.orchestrator.dispatch.lastApplied — 被 1 处写入（actions）但无任何函数读取：状态不产生行为后果
      en: >
          runtime.orchestrator.dispatch.lastApplied
---
