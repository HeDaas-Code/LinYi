---
uid: fe6c26d5
id: truman-town.runtime.orchestrator.dispatch
parent: truman-town.runtime.orchestrator
name: {zh: "行动执行", en: "Action Dispatch"}
description:
  zh: >
      把智能体决策结果解析为世界操作并提交执行。
      
  en: >
      Resolves agent decisions into world operations and commits them.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:14:27.006Z"
fingerprint: 0a358a76618c79fa5480cd80e02913a506763a01c5d84ff989f96bef9895b446
source:
  - path: "src/runtime/orchestrator/dispatch.js"
apis:
  - protocol: rpc
    path: "runtime.orchestrator.dispatch.actions"
    description:
      zh: >
          把解析后的操作提交到 world-state（记录 last_action 并可携带 effect）。
          
      en: >
          Commits resolved operations to world-state (recording last_action with optional effect).
          
  - protocol: rpc
    path: "runtime.orchestrator.dispatch.resolve"
    description:
      zh: >
          归一化并校验智能体决策，产出可提交的世界操作。
          
      en: >
          Normalizes and validates agent decisions into committable world operations.
          
deps:
  - kind: call
    to: truman-town.agent.decision
  - kind: call
    to: truman-town.runtime.world-state
  - kind: call
    to: truman-town.observer.recorder
---
