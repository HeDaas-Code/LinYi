---
uid: 2f665937
id: truman-town.social.graph.edges
parent: truman-town.social.graph
name: {zh: "关系边", en: "Graph Edges"}
description:
  zh: >
      创建与移除朋友、恋人、家人等关系边。
      
  en: >
      Creates and removes friend, lover and family edges.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.838Z"
fingerprint: c45e1a6fa22535cd5480e5109904ec50f97b71439d0c7398156cf67c237d83df
source:
  - path: "src/social/graph/edges.js"
apis:
  - protocol: rpc
    path: "social.graph.edges.create"
    description:
      zh: >
          调用 social.graph.edges.create。
          
      en: >
          Calls social.graph.edges.create.
          
  - protocol: rpc
    path: "social.graph.edges.remove"
    description:
      zh: >
          调用 social.graph.edges.remove。
          
      en: >
          Calls social.graph.edges.remove.
          
deps:
  - kind: dataflow
    to: truman-town.agent.memory.semantic
---
