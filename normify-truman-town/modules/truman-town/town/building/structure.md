---
uid: ec1bdfb9
id: truman-town.town.building.structure
parent: truman-town.town.building
name: {zh: "建筑结构", en: "Building Structure"}
description:
  zh: >
      建造与拆除建筑，记录体量与功能。
      
  en: >
      Constructs and demolishes buildings with volume and function.
      
revision: 45f6c8b7b8ba210fcd94506b2097c8e601dd1382
updated_at: "2026-09-26T01:40:46.603Z"
fingerprint: b6fc6b5b6ca7467d680f2ef7d8f6bbe44136268c02047ddad579a563b425b41d
source:
  - path: "src/town/building/structure.js"
apis:
  - protocol: rpc
    path: "town.building.structure.construct"
    description:
      zh: >
          建造一栋建筑，记录体量（容量）与功能。
          
      en: >
          Constructs a building, recording volume (capacity) and function.
          
  - protocol: rpc
    path: "town.building.structure.demolish"
    description:
      zh: >
          拆除一栋建筑。
          
      en: >
          Demolishes a building.
          
  - protocol: rpc
    path: "town.building.structure.spawnShelter"
    description:
      zh: >
          一键生成初始避难所（核心区/宿舍/食堂/水站等默认建筑与容量）。
          
      en: >
          Generates the initial shelter (core/dorms/canteen/water station with default capacity).
          
deps:
  - kind: call
    to: truman-town.town.map.zoning
---
