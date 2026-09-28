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
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.379Z"
fingerprint: 23eff409096678790232c3960c6606e194e70d863bc0d09ba120c41302c87fa9
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
          
  - protocol: http
    method: GET
    path: "/api/v1/sim/difficulties"
    description:
      zh: >
          列出全部难度档位（含参数与预期表现 + current 标记）。
          
      en: >
          Lists all difficulty presets (params + expected survival + current flag).
          
  - protocol: http
    method: GET
    path: "/api/v1/sim/difficulty"
    description:
      zh: >
          查询当前难度档位。
          
      en: >
          Queries the current difficulty preset.
          
  - protocol: http
    method: POST
    path: "/api/v1/sim/difficulty"
    description:
      zh: >
          切换难度档位（切换后新建的 run 生效）。
          
      en: >
          Switches the difficulty preset (applies to the next run).
          
deps:
  - kind: call
    to: truman-town.runtime.orchestrator.cycle
  - kind: call
    to: truman-town.runtime.orchestrator.loop
---
