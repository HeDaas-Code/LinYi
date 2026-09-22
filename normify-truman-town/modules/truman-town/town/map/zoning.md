---
uid: 425c55b2
id: truman-town.town.map.zoning
parent: truman-town.town.map
name: {zh: "分区", en: "Zoning"}
description:
  zh: >
      划分商业、居住、公共等区域并可重划。
      
  en: >
      Assigns and rezones commercial, residential and public districts.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T07:57:17.694Z"
fingerprint: 1941cade853d93d1bb704a83dfe3fe219da490b82a78c115838c6c76de053605
source:
  - path: "src/town/map/zoning.js"
apis:
  - protocol: rpc
    path: "town.map.zoning.assign"
    description:
      zh: >
          划定一个商业/居住/公共/工业分区并声明容量。
          
      en: >
          Assigns a commercial/residential/public/industrial district with capacity.
          
  - protocol: rpc
    path: "town.map.zoning.rezone"
    description:
      zh: >
          重划已有分区（改类型或容量，保留地块）。
          
      en: >
          Rezones an existing district (changes kind or capacity, keeps plots).
          
deps:
  - kind: call
    to: truman-town.town.map.topology
---
