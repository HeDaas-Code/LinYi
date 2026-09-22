---
uid: 0771012b
id: truman-town.agent.crafting.workbench.output
parent: truman-town.agent.crafting.workbench
name: {zh: "产出登记器", en: "Craft Output"}
description:
  zh: >
      把制作产物写入背包并记录观察日志。
      
  en: >
      Writes crafted outputs into the backpack and observer log.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T08:02:32.258Z"
fingerprint: b2e68fe078708c9901babab50d9061afdf487585affa68b8a2b45e2d86149623
source:
  - path: "src/agent/crafting/workbench/output.js"
apis:
  - protocol: rpc
    path: "agent.crafting.workbench.output.store"
    description:
      zh: >
          把制作产物写入背包。
          
      en: >
          Stores the crafted output into the backpack.
          
  - protocol: rpc
    path: "agent.crafting.workbench.output.log"
    description:
      zh: >
          记录一条制作观察日志（action-log）。
          
      en: >
          Records a crafting action-log entry.
          
deps:
  - kind: call
    to: truman-town.agent.inventory.backpack
  - kind: call
    to: truman-town.observer.recorder
---
