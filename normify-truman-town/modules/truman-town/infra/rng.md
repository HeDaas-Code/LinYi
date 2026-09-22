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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:45:38.726Z"
fingerprint: b54e94ca2d1093e8ddf98649315d99ee238a13194d3ab0bf0aeb16a741e28069
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
