---
uid: 2f665937
id: truman-town.social.graph.edges
parent: truman-town.social.graph
state: planned
name: {zh: "关系边", en: "Graph Edges"}
description:
  zh: >
      创建与移除朋友、恋人、家人等关系边。
  en: >
      Creates and removes friend, lover and family edges.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
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
