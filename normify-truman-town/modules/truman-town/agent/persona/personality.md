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
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.831Z"
fingerprint: d6a53c5c57f8f0c876645022b3d9552538983a5befcee363ee781f348fdeb0e4
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
