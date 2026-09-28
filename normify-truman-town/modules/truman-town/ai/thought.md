---
uid: 9d50fd78
id: truman-town.ai.thought
parent: truman-town.ai
name: {zh: "思维生成", en: "Thought Generation"}
description:
  zh: >
      生成智能体内心思考与行动反思。
      
  en: >
      Generates agent thoughts and reflections.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.833Z"
fingerprint: 90049014e4a94ac985d30ea8f47213a0577b09d1701aabcae75109f3d4298b6f
source:
  - path: "src/ai/thought.js"
apis:
  - protocol: rpc
    path: "ai.thought.generate"
    description:
      zh: >
          生成智能体在当前处境下的内心思考。
          
      en: >
          Generates the agent's inner thought for the current situation.
          
  - protocol: rpc
    path: "ai.thought.reflect"
    description:
      zh: >
          让智能体对刚执行完的行动与结果做反思。
          
      en: >
          Reflects on a just-executed action and its outcome.
          
deps:
  - kind: call
    to: truman-town.ai.llm.gateway
  - kind: call
    to: truman-town.ai.prompt.agent
---
