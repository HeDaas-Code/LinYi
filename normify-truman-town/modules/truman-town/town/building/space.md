---
uid: d8c77810
id: truman-town.town.building.space
parent: truman-town.town.building
name: {zh: "空间分配", en: "Space Allocation"}
description:
  zh: >
      在建筑内分配与释放房间、工位与铺面。
      
  en: >
      Allocates and releases rooms, desks and shop spaces.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: bcd9595a7be4f35e1ed24e585185b4d8918b9d5d7e7be06449f19be23c21ac0d
source:
  - path: "src/town/building/space.js"
apis:
  - protocol: rpc
    path: "town.building.space.allocate"
    description:
      zh: >
          在建筑内分配一个房间/工位/床给占用者（容量校验）。
          
      en: >
          Allocates a room/desk/bed to an occupant (capacity-checked).
          
  - protocol: rpc
    path: "town.building.space.release"
    description:
      zh: >
          释放一个空间并清空占用者。
          
      en: >
          Releases a space and clears its occupant.
          
deps:
  - kind: call
    to: truman-town.town.building.structure
---
