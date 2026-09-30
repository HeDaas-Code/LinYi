---
uid: 86c9eb53
id: truman-town.social.graph.community
parent: truman-town.social.graph
name: {zh: "社区发现", en: "Community Detection"}
description:
  zh: >
      识别社交圈与社区归属，影响信息传播。
      
  en: >
      Detects circles and communities that shape information flow.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.838Z"
fingerprint: 4466bdc37dad940b689497a39392e4b031754f8702c4c07ac2112c3681ac0c86
source:
  - path: "src/social/graph/community.js"
apis:
  - protocol: rpc
    path: "social.graph.community.detect"
    description:
      zh: >
          调用 social.graph.community.detect。
          
      en: >
          Calls social.graph.community.detect.
          
  - protocol: rpc
    path: "social.graph.community.belong"
    description:
      zh: >
          调用 social.graph.community.belong。
          
      en: >
          Calls social.graph.community.belong.
          
deps:
  - kind: call
    to: truman-town.social.graph.edges
---
