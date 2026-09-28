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
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.838Z"
fingerprint: 895306c82c1890813ec2bcff91f59b2d854b803419a14ec27deaec7a23f39c1c
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
