---
uid: 04385cba
id: truman-town.social.politics.law
parent: truman-town.social.politics
name: {zh: "规则", en: "Law"}
description:
  zh: >
      由居民提出、投票与执行避难所规则。
      
  en: >
      Proposes, votes and enforces shelter rules.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:28:10.151Z"
fingerprint: 6b27201ca00956bc5db768768425018f59a4d7a5d1a5f9ee22b72704524b5b0f
source:
  - path: "src/social/politics/law.js"
apis:
  - protocol: rpc
    path: "social.politics.law.propose"
    description:
      zh: >
          提议一条规则。
          
      en: >
          Proposes a law.
          
  - protocol: rpc
    path: "social.politics.law.vote"
    description:
      zh: >
          表决规则（简单多数通过）。
          
      en: >
          Votes on a law (simple majority passes).
          
  - protocol: rpc
    path: "social.politics.law.enforce"
    description:
      zh: >
          执行已生效规则。
          
      en: >
          Enforces an enacted law.
          
deps:
  - kind: call
    to: truman-town.social.politics.faction
  - kind: call
    to: truman-town.observer.recorder
---
