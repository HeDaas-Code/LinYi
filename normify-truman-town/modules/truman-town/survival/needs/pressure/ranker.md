---
uid: 53fc4c6f
id: truman-town.survival.needs.pressure.ranker
parent: truman-town.survival.needs.pressure
name: {zh: "压力排序器", en: "Pressure Ranker"}
description:
  zh: >
      按压力评分排序并给出高危名单。
      
  en: >
      Ranks pressure scores and lists high-risk residents.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:36:55.532Z"
fingerprint: f313ac82948b2dff810f2198b3f79913ca8779baab78978d81f28dafa70742fa
source:
  - path: "src/survival/needs/pressure/ranker.js"
apis:
  - protocol: rpc
    path: "survival.needs.pressure.ranker.rank"
    description:
      zh: >
          按压力评分降序稳定排序（同分按 agentId 升序）。
          
      en: >
          Ranks pressure scores in descending stable order (ties by agentId ascending).
          
  - protocol: rpc
    path: "survival.needs.pressure.ranker.top"
    description:
      zh: >
          取压力最高前 N 名并按 threshold 标注高危。
          
      en: >
          Returns the top N highest-pressure residents flagged high-risk by threshold.
          
deps:
  - kind: call
    to: truman-town.survival.needs.pressure.scorer
---
