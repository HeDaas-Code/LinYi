---
uid: c61ec355
id: truman-town-flow.graph.types.social-platform-post-33527ebd
parent: truman-town-flow.graph.types
name: {zh: "social.platform.post", en: "social.platform.post"}
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
    path: "social-platform-post-33527ebd:write.src_social_platform_posts_js"
    description:
      zh: >
          生产者 src/social/platform/posts.js
      en: >
          producer src/social/platform/posts.js
  - protocol: rpc
    path: "social-platform-post-33527ebd:read.src_civilization_legacy_summary_writer_js"
    description:
      zh: >
          消费者 src/civilization/legacy/summary/writer.js
      en: >
          consumer src/civilization/legacy/summary/writer.js
  - protocol: rpc
    path: "social-platform-post-33527ebd:read.src_runtime_orchestrator__stage2_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/_stage2.js
      en: >
          consumer src/runtime/orchestrator/_stage2.js
  - protocol: rpc
    path: "social-platform-post-33527ebd:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
  - protocol: rpc
    path: "social-platform-post-33527ebd:read.src_social_platform_feeds_js"
    description:
      zh: >
          消费者 src/social/platform/feeds.js
      en: >
          consumer src/social/platform/feeds.js
---
