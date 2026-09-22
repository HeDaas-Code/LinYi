---
uid: 5469d74d
id: truman-town.runtime.clock
parent: truman-town.runtime
name: {zh: "世界时钟", en: "World Clock"}
description:
  zh: >
      维护沙盘逻辑时间，按 tick 推进并调度周期任务。
      
  en: >
      Maintains logical time and schedules periodic tasks by ticks.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:14:27.005Z"
fingerprint: 99ac90d88dcb9201a3426c29dcbdaf0839830b1471a84ca2f0272319660f6585
source:
  - path: "src/runtime/clock.js"
apis:
  - protocol: rpc
    path: "runtime.clock.tick"
    description:
      zh: >
          推进 1 个 tick 并触发到期的周期任务，返回新时间快照与触发任务。
          
      en: >
          Advances one tick and fires due periodic tasks, returning the new time snapshot and fired tasks.
          
  - protocol: rpc
    path: "runtime.clock.now"
    description:
      zh: >
          读取当前逻辑时间快照（tick 与 startedAt）。
          
      en: >
          Reads the current logical time snapshot (tick and startedAt).
          
  - protocol: rpc
    path: "runtime.clock.schedule"
    description:
      zh: >
          注册周期任务：每隔 interval 个 tick 触发一次，返回 id 与取消函数。
          
      en: >
          Registers a periodic task firing every interval ticks, returning its id and a cancel function.
          
---
