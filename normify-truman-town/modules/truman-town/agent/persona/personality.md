---
uid: 0a031f8a
id: truman-town.agent.persona.personality
parent: truman-town.agent.persona
name: {zh: "性格", en: "Personality"}
description:
  zh: >
      用大五人格等维度刻画性格，并评估情境下的行为倾向。
      
  en: >
      Profiles personality traits and evaluates situational behavioral tendencies.
      
revision: 6939444d190f953b7c3e7a73b35ad8b25ac43b07
updated_at: "2026-09-24T02:04:23.739Z"
fingerprint: 43ca3e6d3bc4f74f8f659b2892ecbbb1b4a1db92a7d25b1197622b419ea03091
source:
  - path: "src/agent/persona/personality.js"
apis:
  - protocol: rpc
    path: "agent.persona.personality.profile"
    description:
      zh: >
          调用 agent.persona.personality.profile。
          
      en: >
          Calls agent.persona.personality.profile.
          
  - protocol: rpc
    path: "agent.persona.personality.evaluate"
    description:
      zh: >
          调用 agent.persona.personality.evaluate。
          
      en: >
          Calls agent.persona.personality.evaluate.
          
deps:
  - kind: call
    to: truman-town.agent.traits.tagset
---
