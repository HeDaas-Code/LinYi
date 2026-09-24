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
      
revision: 1c7c3d69497e4bcdd67b1e32a59bd6bdbfdc92f5
updated_at: "2026-09-24T04:00:14.039Z"
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
