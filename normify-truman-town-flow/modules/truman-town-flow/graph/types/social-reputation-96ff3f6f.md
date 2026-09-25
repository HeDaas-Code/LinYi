---
uid: 39b7ec8f
id: truman-town-flow.graph.types.social-reputation-96ff3f6f
parent: truman-town-flow.graph.types
name: {zh: "social.reputation", en: "social.reputation"}
description:
  zh: >
      声明于 undefined:undefined。生产者 1 个，消费者 2 个。
  en: >
      Declared at undefined:undefined; producers=1, consumers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "social-reputation-96ff3f6f:write.src_social_reputation_js"
    description:
      zh: >
          生产者 src/social/reputation.js
      en: >
          producer src/social/reputation.js
  - protocol: rpc
    path: "social-reputation-96ff3f6f:read.src_runtime_orchestrator__stage2_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/_stage2.js
      en: >
          consumer src/runtime/orchestrator/_stage2.js
  - protocol: rpc
    path: "social-reputation-96ff3f6f:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
---
