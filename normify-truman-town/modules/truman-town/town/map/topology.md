---
uid: bb570484
id: truman-town.town.map.topology
parent: truman-town.town.map
name: {zh: "空间拓扑", en: "Topology"}
description:
  zh: >
      查询与规划道路、地块和邻接关系。
      
  en: >
      Queries and plans roads, plots and adjacency.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T07:57:17.694Z"
fingerprint: ab3890eb65ead3a31dc9bedafe431458ed6f31542c5d513ffd15359423682b80
source:
  - path: "src/town/map/topology.js"
apis:
  - protocol: rpc
    path: "town.map.topology.plan"
    description:
      zh: >
          规划（登记）一个地块或道路，记录坐标与邻接关系。
          
      en: >
          Plans (registers) a plot or road with coordinates and adjacency.
          
  - protocol: rpc
    path: "town.map.topology.query"
    description:
      zh: >
          查询拓扑：全部 / 按 id / 按 kind（plot/road）过滤。
          
      en: >
          Queries topology: all / by id / filtered by kind (plot/road).
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
