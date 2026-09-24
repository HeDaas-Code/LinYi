---
uid: 7ef2b6ed
id: truman-town.social.platform.posts
parent: truman-town.social.platform
name: {zh: "帖子", en: "Posts"}
description:
  zh: >
      发布、回复与回应帖子，承载公共表达。
      
  en: >
      Publishes posts, replies and reactions for public expression.
      
revision: e317580e2e9326327504170ed572a942b2b0db47
updated_at: "2026-09-24T07:01:20.043Z"
fingerprint: d8ae82d4776d553250e664c327ea57d271bd881aad67bfc4f710b29d6aa37b54
source:
  - path: "src/social/platform/posts.js"
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
