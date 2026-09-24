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
      
revision: 4788222c1cdff2eb10ed7dc2c16d2ef52b8e3596
updated_at: "2026-09-24T05:32:40.349Z"
fingerprint: 5f4e70a1dbf72d40c3c99f921e4bfbb4743f6a049c26cbd497cedadb35c5e991
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
