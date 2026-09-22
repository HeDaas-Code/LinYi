---
uid: 6409b192
id: truman-town.survival.goal
parent: truman-town.survival
state: planned
name: {zh: "生存目标", en: "Survival Goal"}
description:
  zh: >
      把“继续活下去”作为最高目标，输出生存策略并统计已存活时长。
  en: >
      Makes survival the top goal, outputs survival strategy and tracks elapsed time.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:55:51Z"
fingerprint: pending
source: []
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
