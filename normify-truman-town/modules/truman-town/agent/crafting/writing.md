---
uid: e8552b3c
id: truman-town.agent.crafting.writing
parent: truman-town.agent.crafting
name: {zh: "撰写书籍", en: "Book Writing"}
description:
  zh: >
      消耗 tick，把记忆、知识与文化写进书籍并放入背包或图书馆。
      
  en: >
      Consumes ticks to write memory, knowledge and culture into books for the backpack or library.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.827Z"
fingerprint: 3476a1c8db583e623281399cddd767932eb9e8ba9f04dc200e31cf50e07241d4
source:
  - path: "src/agent/crafting/writing.js"
apis:
  - protocol: rpc
    path: "agent.crafting.writing.write_book"
    description:
      zh: >
          发起著书：校验 + 扣材料 + 登记耗时任务。
          
      en: >
          Starts writing a book: validates, deducts materials and enqueues a timed job.
          
  - protocol: rpc
    path: "agent.crafting.writing.tick"
    description:
      zh: >
          推进著书任务，归零后书籍入背包并记录观察日志。
          
      en: >
          Advances writing jobs; on completion, stores the book and observer log.
          
deps:
  - kind: call
    to: truman-town.agent.crafting.recipe
  - kind: call
    to: truman-town.agent.memory.semantic
  - kind: call
    to: truman-town.civilization.tech.tree
  - kind: call
    to: truman-town.agent.inventory.backpack
  - kind: call
    to: truman-town.runtime.clock
  - kind: call
    to: truman-town.observer.recorder
---
