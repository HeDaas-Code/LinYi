---
uid: 4b152856
id: truman-town-flow.machines.list.agent-lifecycle-f5cfb834
parent: truman-town-flow.machines.list
name: {zh: "agent.lifecycle（未出生 → 存活 → 死亡）", en: "agent.lifecycle"}
description:
  zh: >
      未出生→存活：agent.lifecycle.birth({tick, age})；存活→存活(阶段变化)：agent.lifecycle.age() → stageOf(age) 未成年/成年/老年；存活→死亡：age 超过老年死亡率 或 needs 顶格持续（starvation/dehydration）
  en: >
      agent.lifecycle state machine with 3 transitions
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent-lifecycle-f5cfb834:t0_未出生_to_存活"
    description:
      zh: >
          agent.lifecycle.birth({tick, age}) @src/agent/lifecycle.js:49
      en: >
          agent.lifecycle.birth({tick, age})
  - protocol: rpc
    path: "agent-lifecycle-f5cfb834:t1_存活_to_存活(阶段变化)"
    description:
      zh: >
          agent.lifecycle.age() → stageOf(age) 未成年/成年/老年 @src/agent/lifecycle.js:33
      en: >
          agent.lifecycle.age() → stageOf(age) 未成年/成年/老年
  - protocol: rpc
    path: "agent-lifecycle-f5cfb834:t2_存活_to_死亡"
    description:
      zh: >
          age 超过老年死亡率 或 needs 顶格持续（starvation/dehydration） @src/agent/lifecycle.js:98
      en: >
          age 超过老年死亡率 或 needs 顶格持续（starvation/dehydration）
---
