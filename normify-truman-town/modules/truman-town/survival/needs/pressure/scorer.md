---
uid: ce66bd06
id: truman-town.survival.needs.pressure.scorer
parent: truman-town.survival.needs.pressure
name: {zh: "压力评分器", en: "Pressure Scorer"}
description:
  zh: >
      综合需求缺口与资源稀缺度给每个居民评分。
      
  en: >
      Scores each resident from need deficits and scarcity.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:36:55.532Z"
fingerprint: 45665b459ed49391ac5fa9a3cbd259e7c406fe13d75e70e78ec6c82adfe4554e
source:
  - path: "src/survival/needs/pressure/scorer.js"
apis:
  - protocol: rpc
    path: "survival.needs.pressure.scorer.score"
    description:
      zh: >
          综合需求缺口与稀缺度给居民评分（score 与归一化 normalized）。
          
      en: >
          Scores a resident from need deficits and scarcity (score and normalized).
          
  - protocol: rpc
    path: "survival.needs.pressure.scorer.factor"
    description:
      zh: >
          计算单类需求因子的压力贡献 level×(1+scarcity)×weight。
          
      en: >
          Computes one need factor as level×(1+scarcity)×weight.
          
deps:
  - kind: call
    to: truman-town.survival.needs.meter
---
