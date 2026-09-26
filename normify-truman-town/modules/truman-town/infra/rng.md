---
uid: d39eff63
id: truman-town.infra.rng
parent: truman-town.infra
name: {zh: "随机与种子", en: "RNG"}
description:
  zh: >
      提供可复现的随机数与种子管理。
      
  en: >
      Provides reproducible randomness and seed management.
      
revision: 45f6c8b7b8ba210fcd94506b2097c8e601dd1382
updated_at: "2026-09-26T01:40:46.603Z"
fingerprint: 9b870ea3e1c34c4f345f256953dc1007bffb339dbd324da46a05b89c7a2612ee
source:
  - path: "src/infra/rng.js"
apis:
  - protocol: rpc
    path: "infra.rng.seed"
    description:
      zh: >
          固定随机源；同一 seed 保证随机序列可复现。
          
      en: >
          Fixes the random source; the same seed reproduces the same sequence.
          
  - protocol: rpc
    path: "infra.rng.next"
    description:
      zh: >
          返回 [0,1) 区间的均匀伪随机浮点数。
          
      en: >
          Returns a uniform pseudo-random float in [0,1).
          
---
