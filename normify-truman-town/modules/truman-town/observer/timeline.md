---
uid: a2cdd17e
id: truman-town.observer.timeline
parent: truman-town.observer
state: planned
name: {zh: "时间线", en: "Timeline"}
description:
  zh: >
      提供任意时间区间的行为与决策时间线查询。
  en: >
      Queries behavior and decision timelines over arbitrary ranges.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:55:51Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "observer.timeline.get"
    description:
      zh: >
          调用 observer.timeline.get。
      en: >
          Calls observer.timeline.get.
  - protocol: rpc
    path: "observer.timeline.range"
    description:
      zh: >
          调用 observer.timeline.range。
      en: >
          Calls observer.timeline.range.
deps:
  - kind: dataflow
    to: truman-town.observer.chronicle
---
