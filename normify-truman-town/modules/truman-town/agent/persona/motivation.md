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
      
revision: 6939444d190f953b7c3e7a73b35ad8b25ac43b07
updated_at: "2026-09-24T02:04:23.738Z"
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
