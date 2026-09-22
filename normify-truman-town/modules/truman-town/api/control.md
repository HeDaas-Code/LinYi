---
uid: "0e136836"
id: truman-town.api.control
parent: truman-town.api
name: {zh: "模拟控制", en: "Simulation Control"}
description:
  zh: >
      启动、暂停与步进模拟。
      
  en: >
      Starts, pauses and steps the simulation.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T07:20:13.532Z"
fingerprint: 0caf9a346bd32ae0139e7317adb805f83720b45a95b04f35a5de1e439c57f4d5
source:
  - path: "src/api/control.js"
apis:
  - protocol: http
    method: POST
    path: "/api/v1/sim/start"
    description:
      zh: >
          启动模拟主循环（缺省初始化 3 个居民并置为 running）。
          
      en: >
          Starts the simulation loop (spawns 3 residents by default and enters running).
          
  - protocol: http
    method: POST
    path: "/api/v1/sim/pause"
    description:
      zh: >
          暂停模拟主循环（置为 paused）。
          
      en: >
          Pauses the simulation loop (enters paused).
          
  - protocol: http
    method: POST
    path: "/api/v1/sim/step"
    description:
      zh: >
          推进一个完整 tick 闭环并返回本次摘要。
          
      en: >
          Advances one full tick of the loop and returns its summary.
          
deps:
  - kind: call
    to: truman-town.runtime.orchestrator.cycle
  - kind: call
    to: truman-town.runtime.orchestrator.loop
---
