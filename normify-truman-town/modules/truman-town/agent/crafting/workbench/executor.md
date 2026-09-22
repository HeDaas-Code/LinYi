---
uid: 0d88b481
id: truman-town.agent.crafting.workbench.executor
parent: truman-town.agent.crafting.workbench
name: {zh: "制作执行器", en: "Craft Executor"}
description:
  zh: >
      消耗 tick、材料与能源执行制作。
      
  en: >
      Consumes ticks, materials and energy to execute crafting.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T08:02:32.256Z"
fingerprint: 701e63e81095340f9a3eb0df16027b538357dd6351d504259fe3715f05ca7c25
source:
  - path: "src/agent/crafting/workbench/executor.js"
apis:
  - protocol: rpc
    path: "agent.crafting.workbench.executor.craft"
    description:
      zh: >
          发起物品制作：校验 + 扣材料 + 登记耗时任务。
          
      en: >
          Starts a craft: validates, deducts materials and enqueues a timed job.
          
  - protocol: rpc
    path: "agent.crafting.workbench.executor.tick"
    description:
      zh: >
          推进制作任务，归零后产物入背包并写观察日志。
          
      en: >
          Advances craft jobs; on completion, stores output and writes the observer log.
          
deps:
  - kind: call
    to: truman-town.agent.crafting.workbench.validator
  - kind: call
    to: truman-town.runtime.clock
  - kind: call
    to: truman-town.survival.resources.energy
---
