---
uid: c40ff580
id: truman-town.survival.events.generator.roller
parent: truman-town.survival.events.generator
name: {zh: "概率掷点器", en: "Event Roller"}
description:
  zh: >
      用随机数掷出是否发生突发事件。
      
  en: >
      Rolls whether a random event occurs.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.838Z"
fingerprint: 2079bd71cdd05eac36eead684f9804aec9e01da35f353d3aa98dd2aae9481cf8
source:
  - path: "src/survival/events/generator/roller.js"
apis:
  - protocol: rpc
    path: "survival.events.generator.roller.roll"
    description:
      zh: >
          掷出是否发生突发事件（probability 夹在 [0,1]）。
          
      en: >
          Rolls whether a random event occurs (probability clamped to [0,1]).
          
  - protocol: rpc
    path: "survival.events.generator.roller.seed"
    description:
      zh: >
          固定随机源，保证突发事件序列可回放。
          
      en: >
          Seeds the RNG so event sequences are reproducible.
          
deps:
  - kind: call
    to: truman-town.infra.rng
---
