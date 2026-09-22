---
uid: 4bcbd9d8
id: truman-town.social.culture.meme
parent: truman-town.social.culture
name: {zh: "模因", en: "Meme"}
description:
  zh: >
      观念在居民间传播、变异与消亡，写事件日志。
      
  en: >
      Ideas spread, mutate and die among residents, with event logging.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:22:57.360Z"
fingerprint: eba3c5e7f2efdbc4756afedebae241e824c62a27456e075853d78e5179a0e4b7
source:
  - path: "src/social/culture/meme.js"
apis:
  - protocol: rpc
    path: "social.culture.meme.spread"
    description:
      zh: >
          把一个模因从一名居民传给另一名居民。
          
      en: >
          Spreads a meme from one resident to another.
          
  - protocol: rpc
    path: "social.culture.meme.mutate"
    description:
      zh: >
          用 rng 变异一个模因出新代。
          
      en: >
          Mutates a meme into a new generation via rng.
          
  - protocol: rpc
    path: "social.culture.meme.extinct"
    description:
      zh: >
          标记一个模因消亡。
          
      en: >
          Marks a meme extinct.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
    label: {zh: "持久化模因", en: "Persist memes"}
  - kind: call
    to: truman-town.infra.rng
    label: {zh: "变异随机", en: "Mutation randomness"}
  - kind: call
    to: truman-town.observer.recorder
    label: {zh: "写事件日志", en: "Write event log"}
---
