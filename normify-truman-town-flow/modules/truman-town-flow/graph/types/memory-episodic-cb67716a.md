---
uid: e4ef6e4d
id: truman-town-flow.graph.types.memory-episodic-cb67716a
parent: truman-town-flow.graph.types
name: {zh: "memory.episodic", en: "memory.episodic"}
description:
  zh: >
      声明于 undefined:undefined。生产者 1 个，消费者 4 个。
  en: >
      Declared at undefined:undefined; producers=1, consumers=4
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "memory-episodic-cb67716a:write.src_agent_memory_episodic_store_js"
    description:
      zh: >
          生产者 src/agent/memory/episodic/store.js
      en: >
          producer src/agent/memory/episodic/store.js
  - protocol: rpc
    path: "memory-episodic-cb67716a:read.src_agent_memory_episodic_store_js"
    description:
      zh: >
          消费者 src/agent/memory/episodic/store.js
      en: >
          consumer src/agent/memory/episodic/store.js
  - protocol: rpc
    path: "memory-episodic-cb67716a:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
  - protocol: rpc
    path: "memory-episodic-cb67716a:read.src_social_graph_edges_js"
    description:
      zh: >
          消费者 src/social/graph/edges.js
      en: >
          consumer src/social/graph/edges.js
  - protocol: rpc
    path: "memory-episodic-cb67716a:read.src_social_platform_posts_js"
    description:
      zh: >
          消费者 src/social/platform/posts.js
      en: >
          consumer src/social/platform/posts.js
---
