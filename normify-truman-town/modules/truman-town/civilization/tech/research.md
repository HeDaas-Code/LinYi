---
uid: 9e7260ba
id: truman-town.civilization.tech.research
parent: truman-town.civilization.tech
name: {zh: "研究", en: "Research"}
description:
  zh: >
      由工程师、医生等职业角色推进研究进度并完成技术突破。
      
  en: >
      Advances research progress by engineers, doctors and other roles to complete breakthroughs.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.380Z"
fingerprint: ebea2d5fdd8850c70ed1e1e7f81a804465cf55c83ab394986da57b4efdb5ac98
source:
  - path: "src/civilization/tech/research.js"
apis:
  - protocol: rpc
    path: "civilization.tech.research.start"
    description:
      zh: >
          开始一项技术研究（校验前置 / 资源，登记任务）。
          
      en: >
          Starts researching a tech (validates prerequisites and registers a task).
          
  - protocol: rpc
    path: "civilization.tech.research.progress"
    description:
      zh: >
          推进研究 n 个 tick，每 tick 消耗能源并累计进度。
          
      en: >
          Advances research by n ticks, consuming energy and accumulating progress.
          
  - protocol: rpc
    path: "civilization.tech.research.complete"
    description:
      zh: >
          进度达标后完成技术突破并解锁技术。
          
      en: >
          Completes the breakthrough and unlocks the tech once progress is met.
          
deps:
  - kind: call
    to: truman-town.agent.role.career
  - kind: call
    to: truman-town.survival.resources.energy
  - kind: call
    to: truman-town.observer.recorder
---
