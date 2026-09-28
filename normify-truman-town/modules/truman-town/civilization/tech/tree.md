---
uid: 438a6d0a
id: truman-town.civilization.tech.tree
parent: truman-town.civilization.tech
name: {zh: "技术树", en: "Tech Tree"}
description:
  zh: >
      查询、解锁与锁定净水、温室、发电、医疗、通信等技术节点。
      
  en: >
      Queries, unlocks and locks tech nodes like water purification, greenhouses, power, medicine and comms.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.834Z"
fingerprint: 924d649a369bb9c8df18cf5a71537f76da35669f27f49e6e6fbde2404186e013
source:
  - path: "src/civilization/tech/tree.js"
apis:
  - protocol: rpc
    path: "civilization.tech.tree.query"
    description:
      zh: >
          查询单个或全部技术节点（状态 / 前置 / 成本 / 掌握者）。
          
      en: >
          Queries one or all tech nodes (state / prerequisites / cost / holders).
          
  - protocol: rpc
    path: "civilization.tech.tree.unlock"
    description:
      zh: >
          解锁技术节点（要求全部前置已解锁），记录掌握者并写观察日志。
          
      en: >
          Unlocks a tech node (all prerequisites unlocked), records holders and logs.
          
  - protocol: rpc
    path: "civilization.tech.tree.lock"
    description:
      zh: >
          锁定（失传）技术节点使其不可用，并写观察日志。
          
      en: >
          Locks (forgets) a tech node making it unavailable, and logs.
          
deps:
  - kind: call
    to: truman-town.civilization.tech.research
---
