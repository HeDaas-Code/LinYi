---
uid: 0a031f8a
id: truman-town.agent.persona.personality
parent: truman-town.agent.persona
state: planned
name: {zh: "性格", en: "Personality"}
description:
  zh: >
      用大五人格等维度刻画性格，并评估情境下的行为倾向。
  en: >
      Profiles personality traits and evaluates situational behavioral tendencies.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
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
