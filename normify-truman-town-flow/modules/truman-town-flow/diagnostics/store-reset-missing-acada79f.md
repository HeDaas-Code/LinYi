---
uid: 474057df
id: truman-town-flow.diagnostics.store-reset-missing-acada79f
parent: truman-town-flow.diagnostics
name: {zh: "store/reset-missing（8）", en: "store/reset-missing (8)"}
description:
  zh: >
      agent.memory.episodic.store.lastGeneration @src/agent/memory/episodic/store.js:25；infra.events.retry.deadLetters @src/infra/events/retry.js:22；runtime.orchestrator._stage2.platformGen @src/runtime/orchestrator/_stage2.js:46；runtime.orchestrator.loop.layaUrgencyCache @src/runtime/orchestrator/loop.js:68；runtime.orchestrator.loop._alivePopGeneration @src/runtime/orchestrator/loop.js:156；runtime.orchestrator.loop._alivePopValue @src/runtime/orchestrator/loop.js:157
  en: >
      store/reset-missing findings: 8
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "store-reset-missing-acada79f:store/reset-missing.0"
    description:
      zh: >
          agent.memory.episodic.store.lastGeneration — 文件有 __reset 但未覆盖该变量：跨 run 残留会使结果取决于此前跑过什么
      en: >
          agent.memory.episodic.store.lastGeneration
  - protocol: rpc
    path: "store-reset-missing-acada79f:store/reset-missing.1"
    description:
      zh: >
          infra.events.retry.deadLetters — 文件有 __reset 但未覆盖该变量：跨 run 残留会使结果取决于此前跑过什么
      en: >
          infra.events.retry.deadLetters
  - protocol: rpc
    path: "store-reset-missing-acada79f:store/reset-missing.2"
    description:
      zh: >
          runtime.orchestrator._stage2.platformGen — 文件有 __reset 但未覆盖该变量：跨 run 残留会使结果取决于此前跑过什么
      en: >
          runtime.orchestrator._stage2.platformGen
  - protocol: rpc
    path: "store-reset-missing-acada79f:store/reset-missing.3"
    description:
      zh: >
          runtime.orchestrator.loop.layaUrgencyCache — 文件有 __reset 但未覆盖该变量：跨 run 残留会使结果取决于此前跑过什么
      en: >
          runtime.orchestrator.loop.layaUrgencyCache
  - protocol: rpc
    path: "store-reset-missing-acada79f:store/reset-missing.4"
    description:
      zh: >
          runtime.orchestrator.loop._alivePopGeneration — 文件有 __reset 但未覆盖该变量：跨 run 残留会使结果取决于此前跑过什么
      en: >
          runtime.orchestrator.loop._alivePopGeneration
  - protocol: rpc
    path: "store-reset-missing-acada79f:store/reset-missing.5"
    description:
      zh: >
          runtime.orchestrator.loop._alivePopValue — 文件有 __reset 但未覆盖该变量：跨 run 残留会使结果取决于此前跑过什么
      en: >
          runtime.orchestrator.loop._alivePopValue
  - protocol: rpc
    path: "store-reset-missing-acada79f:store/reset-missing.6"
    description:
      zh: >
          social.platform.posts.lastGeneration — 文件有 __reset 但未覆盖该变量：跨 run 残留会使结果取决于此前跑过什么
      en: >
          social.platform.posts.lastGeneration
  - protocol: rpc
    path: "store-reset-missing-acada79f:store/reset-missing.7"
    description:
      zh: >
          social.reputation.lastGeneration — 文件有 __reset 但未覆盖该变量：跨 run 残留会使结果取决于此前跑过什么
      en: >
          social.reputation.lastGeneration
---
