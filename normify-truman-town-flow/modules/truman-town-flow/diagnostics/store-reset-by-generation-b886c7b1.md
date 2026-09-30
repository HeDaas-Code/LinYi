---
uid: 2201a6c8
id: truman-town-flow.diagnostics.store-reset-by-generation-b886c7b1
parent: truman-town-flow.diagnostics
name: {zh: "store/reset-by-generation（3）", en: "store/reset-by-generation (3)"}
description:
  zh: >
      agent.memory.episodic.store.lastGeneration @src/agent/memory/episodic/store.js:25；social.platform.posts.lastGeneration @src/social/platform/posts.js:35；social.reputation.lastGeneration @src/social/reputation.js:46
  en: >
      store/reset-by-generation findings: 3
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "store-reset-by-generation-b886c7b1:store/reset-by-generation.0"
    description:
      zh: >
          agent.memory.episodic.store.lastGeneration — 派生缓存（世代号）：由 __reset 或 ensureFresh 重建，非泄漏
      en: >
          agent.memory.episodic.store.lastGeneration
  - protocol: rpc
    path: "store-reset-by-generation-b886c7b1:store/reset-by-generation.1"
    description:
      zh: >
          social.platform.posts.lastGeneration — 派生缓存（世代号）：由 __reset 或 ensureFresh 重建，非泄漏
      en: >
          social.platform.posts.lastGeneration
  - protocol: rpc
    path: "store-reset-by-generation-b886c7b1:store/reset-by-generation.2"
    description:
      zh: >
          social.reputation.lastGeneration — 派生缓存（世代号）：由 __reset 或 ensureFresh 重建，非泄漏
      en: >
          social.reputation.lastGeneration
---
