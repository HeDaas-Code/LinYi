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
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.838Z"
fingerprint: 41539505249e7aee761f2ba11544adce5af03bcd3b6ce82dbc275f93585be292
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
