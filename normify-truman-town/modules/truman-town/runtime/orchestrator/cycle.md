---
uid: e9aa513c
id: truman-town.runtime.orchestrator.cycle
parent: truman-town.runtime.orchestrator
name: {zh: "循环控制", en: "Cycle Control"}
description:
  zh: >
      控制主循环的启动、暂停、恢复与步进节奏。
      
  en: >
      Starts, pauses, resumes and steps the main loop.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.836Z"
fingerprint: 624f64df5eb8310d134cd3f4208fc3865fc09f8c012516568dc7eb4be7cb5600
source:
  - path: "src/runtime/orchestrator/cycle.js"
apis:
  - protocol: rpc
    path: "runtime.orchestrator.cycle.run"
    description:
      zh: >
          同步推进 N 个 tick，每个 tick 先推进时钟再执行 step。
          
      en: >
          Synchronously advances N ticks; each tick advances the clock then runs the step.
          
  - protocol: rpc
    path: "runtime.orchestrator.cycle.pause"
    description:
      zh: >
          暂停主循环（当前步进提前结束）。
          
      en: >
          Pauses the main loop (the current run ends early).
          
  - protocol: rpc
    path: "runtime.orchestrator.cycle.resume"
    description:
      zh: >
          恢复主循环，使后续 run 继续推进。
          
      en: >
          Resumes the main loop so subsequent runs keep advancing.
          
deps:
  - kind: call
    to: truman-town.runtime.clock
  - kind: call
    to: truman-town.agent.schedule.executor
  - kind: call
    to: truman-town.survival.events.generator
---
