---
uid: 575db10e
id: truman-town.social.platform.feeds
parent: truman-town.social.platform
state: planned
name: {zh: "信息流", en: "Feeds"}
description:
  zh: >
      按关系与兴趣为智能体生成和排序信息流。
  en: >
      Generates and ranks feeds by relationships and interests.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
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
