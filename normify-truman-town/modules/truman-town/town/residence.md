---
uid: b59ba783
id: truman-town.town.residence
parent: truman-town.town
name: {zh: "住宅", en: "Residence"}
description:
  zh: >
      处理入住、搬出与租金，连接家庭与住房。
      
  en: >
      Handles move-in, move-out and rent linking families to housing.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T07:57:17.695Z"
fingerprint: d930fb45cd94111e69dc15ffab326e0515805148219556cf3faa438a79059efa
source:
  - path: "src/town/residence.js"
apis:
  - protocol: rpc
    path: "town.residence.move_in"
    description:
      zh: >
          居民入住某住宅。
          
      en: >
          Moves a resident into a residence.
          
  - protocol: rpc
    path: "town.residence.move_out"
    description:
      zh: >
          居民搬出某住宅（未指定住所则从全部住宅移除）。
          
      en: >
          Moves a resident out (removes from all residences if unspecified).
          
  - protocol: rpc
    path: "town.residence.rent"
    description:
      zh: >
          记录某居民在住宅的租金（累加）。
          
      en: >
          Records a resident's rent at a residence (accumulated).
          
deps:
  - kind: call
    to: truman-town.town.building.space
---
