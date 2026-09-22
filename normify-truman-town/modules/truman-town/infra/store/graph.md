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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:45:38.726Z"
fingerprint: 2aee22d080905ddb6ce0333227908f3c921b86355843c8297225b7f0d00c7966
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
