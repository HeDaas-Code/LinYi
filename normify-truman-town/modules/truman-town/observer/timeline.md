---
uid: a2cdd17e
id: truman-town.observer.timeline
parent: truman-town.observer
name: {zh: "时间线", en: "Timeline"}
description:
  zh: >
      提供任意时间区间的行为与决策时间线查询。
      
  en: >
      Queries behavior and decision timelines over arbitrary ranges.
      
revision: 796aec9412d132997f5cdc37d01cac934e03d018
updated_at: "2026-09-25T10:03:44.359Z"
fingerprint: c31e0ac50ba84efa7ff510cd2d4e367b8189892cf854371ba9975b3becd5a887
source:
  - path: "src/observer/timeline.js"
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
