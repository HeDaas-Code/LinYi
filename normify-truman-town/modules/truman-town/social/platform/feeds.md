---
uid: 575db10e
id: truman-town.social.platform.feeds
parent: truman-town.social.platform
name: {zh: "信息流", en: "Feeds"}
description:
  zh: >
      按关系与兴趣为智能体生成和排序信息流。
      
  en: >
      Generates and ranks feeds by relationships and interests.
      
revision: 4788222c1cdff2eb10ed7dc2c16d2ef52b8e3596
updated_at: "2026-09-24T05:32:40.349Z"
fingerprint: 04816c0f96f4991ed25795e7d96ea468fac845885aaa976e59dedf9a4b43b8d9
source:
  - path: "src/social/platform/feeds.js"
apis:
  - protocol: rpc
    path: "social.platform.feeds.generate"
    description:
      zh: >
          调用 social.platform.feeds.generate。
          
      en: >
          Calls social.platform.feeds.generate.
          
  - protocol: rpc
    path: "social.platform.feeds.rank"
    description:
      zh: >
          调用 social.platform.feeds.rank。
          
      en: >
          Calls social.platform.feeds.rank.
          
deps:
  - kind: call
    to: truman-town.social.graph.community
---
