---
uid: 992b3347
id: truman-town.infra.store.graph
parent: truman-town.infra.store
name: {zh: "图存储", en: "Graph Store"}
description:
  zh: >
      读写社交图与空间拓扑等图数据。
      
  en: >
      Reads and writes graph data such as social and spatial topology.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.836Z"
fingerprint: 536e8f5dbbfdeb4b85a5f0ad562bd6b2ec9671d54863f3d4bfc3169a07259f6b
source:
  - path: "src/infra/store/graph.js"
apis:
  - protocol: rpc
    path: "infra.store.graph.write"
    description:
      zh: >
          幂等写入（upsert）一个图节点及其出向边。
          
      en: >
          Idempotently upserts a graph node and its outgoing edges.
          
  - protocol: rpc
    path: "infra.store.graph.read"
    description:
      zh: >
          按 id / type 读取图节点，或读取全部节点。
          
      en: >
          Reads graph nodes by id / type, or returns all nodes.
          
---
