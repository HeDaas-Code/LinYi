---
uid: 513b0af8
id: truman-town.agent.persona.motivation
parent: truman-town.agent.persona
name: {zh: "动机", en: "Motivation"}
description:
  zh: >
      评估需求、目标与情绪驱动力，输出行动优先级。
      
  en: >
      Evaluates needs, goals and emotional drives to rank action priorities.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.831Z"
fingerprint: c672a858be9b17677c79a42b99cdf716757df15e4ae73d3b5eb6304a08e23454
source:
  - path: "src/agent/persona/motivation.js"
apis:
  - protocol: rpc
    path: "agent.persona.motivation.evaluate"
    description:
      zh: >
          调用 agent.persona.motivation.evaluate。
          
      en: >
          Calls agent.persona.motivation.evaluate.
          
  - protocol: rpc
    path: "agent.persona.motivation.rank"
    description:
      zh: >
          调用 agent.persona.motivation.rank。
          
      en: >
          Calls agent.persona.motivation.rank.
          
---
