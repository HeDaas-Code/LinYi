---
uid: ad3a1972
id: truman-town.agent.decision.selector
parent: truman-town.agent.decision
name: {zh: "行动选择器", en: "Action Selector"}
description:
  zh: >
      从候选行动中选择最终行动并给出 softmax 置信度。
      
  en: >
      Chooses the final action from candidates with a softmax confidence.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.827Z"
fingerprint: f71a00b8596ebb15f79a16c8138dda032d90340fc34d87696f0c9aa58786cad4
source:
  - path: "src/agent/decision/selector.js"
apis:
  - protocol: rpc
    path: "agent.decision.selector.choose"
    description:
      zh: >
          选择评分最高的候选并返回 {id, action, score, confidence, reason}。
          
      en: >
          Chooses the best candidate returning {id, action, score, confidence, reason}.
          
  - protocol: rpc
    path: "agent.decision.selector.confidence"
    description:
      zh: >
          计算指定候选相对候选集的 softmax 置信度。
          
      en: >
          Computes softmax confidence of a candidate vs the set.
          
deps:
  - kind: call
    to: truman-town.agent.decision.context
  - kind: call
    to: truman-town.agent.anticipation.pool
  - kind: call
    to: truman-town.agent.persona.motivation
---
