---
uid: 7ef2b6ed
id: truman-town.social.platform.posts
parent: truman-town.social.platform
state: planned
name: {zh: "帖子", en: "Posts"}
description:
  zh: >
      发布、回复与回应帖子，承载公共表达。
  en: >
      Publishes posts, replies and reactions for public expression.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "social.platform.posts.publish"
    description:
      zh: >
          调用 social.platform.posts.publish。
      en: >
          Calls social.platform.posts.publish.
  - protocol: rpc
    path: "social.platform.posts.reply"
    description:
      zh: >
          调用 social.platform.posts.reply。
      en: >
          Calls social.platform.posts.reply.
  - protocol: rpc
    path: "social.platform.posts.react"
    description:
      zh: >
          调用 social.platform.posts.react。
      en: >
          Calls social.platform.posts.react.
deps:
  - kind: dataflow
    to: truman-town.agent.memory.episodic
---
