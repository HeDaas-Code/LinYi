---
uid: 6409b192
id: truman-town.survival.goal
parent: truman-town.survival
name: {zh: "生存目标", en: "Survival Goal"}
description:
  zh: >
      把“继续活下去”作为最高目标，输出生存策略并统计已存活时长。
      
  en: >
      Makes survival the top goal, outputs survival strategy and tracks elapsed time.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: be58bcc56a82058df013a2674b8bca7e46ad5ad44d05838267c99da76286d5d7
source:
  - path: "src/survival/goal.js"
apis:
  - protocol: rpc
    path: "survival.goal.survive"
    description:
      zh: >
          调用 survival.goal.survive。
          
      en: >
          Calls survival.goal.survive.
          
  - protocol: rpc
    path: "survival.goal.elapsed"
    description:
      zh: >
          调用 survival.goal.elapsed。
          
      en: >
          Calls survival.goal.elapsed.
          
deps:
  - kind: call
    to: truman-town.survival.needs.pressure
---
