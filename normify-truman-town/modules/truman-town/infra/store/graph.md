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
      
revision: e023d797f741ad817f8c81c2bd91de8d996e39ac
updated_at: "2026-09-23T04:24:00.238Z"
fingerprint: 977f82da3a357196003a8b8ba3c67f23d51e05e67e125b6acc25a4d604d811d4
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
