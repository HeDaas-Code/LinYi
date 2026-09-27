---
uid: 04a27adb
id: truman-town-flow.graph.types.agent-schedule-da1a29c5
parent: truman-town-flow.graph.types
name: {zh: "agent.schedule", en: "agent.schedule"}
description:
  zh: >
      声明于 undefined:undefined。生产者 1 个，消费者 4 个。
  en: >
      Declared at undefined:undefined; producers=1, consumers=4
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent-schedule-da1a29c5:write.src_agent_schedule_planner_js"
    description:
      zh: >
          生产者 src/agent/schedule/planner.js
      en: >
          producer src/agent/schedule/planner.js
  - protocol: rpc
    path: "agent-schedule-da1a29c5:read.src_agent_decision_action_contract_js"
    description:
      zh: >
          消费者 src/agent/decision/action-contract.js
      en: >
          consumer src/agent/decision/action-contract.js
  - protocol: rpc
    path: "agent-schedule-da1a29c5:read.src_agent_schedule_executor_js"
    description:
      zh: >
          消费者 src/agent/schedule/executor.js
      en: >
          consumer src/agent/schedule/executor.js
  - protocol: rpc
    path: "agent-schedule-da1a29c5:read.src_agent_schedule_planner_js"
    description:
      zh: >
          消费者 src/agent/schedule/planner.js
      en: >
          consumer src/agent/schedule/planner.js
  - protocol: rpc
    path: "agent-schedule-da1a29c5:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
---
