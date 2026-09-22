---
uid: c59d7120
id: truman-town.agent.anticipation.pool.selector
parent: truman-town.agent.anticipation.pool
name: {zh: "候选选择器", en: "Candidate Selector"}
description:
  zh: >
      按模拟评分从预想池选择候选行动并生成短名单。
      
  en: >
      Selects and shortlists pool candidates by simulated scores.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:24:06.394Z"
fingerprint: 6e3a72cba7017fc89b691e53267282d1cfda4b5f252aac42683be2400f109afe
source:
  - path: "src/agent/anticipation/pool/selector.js"
apis:
  - protocol: rpc
    path: "agent.anticipation.pool.selector.select"
    description:
      zh: >
          选择评分最高的单个候选；池为空返回 null。
          
      en: >
          Selects the top-scored candidate; null when empty.
          
  - protocol: rpc
    path: "agent.anticipation.pool.selector.shortlist"
    description:
      zh: >
          生成按评分降序的前 limit 个候选。
          
      en: >
          Returns the top `limit` candidates by score desc.
          
deps:
  - kind: call
    to: truman-town.agent.anticipation.pool.store
  - kind: call
    to: truman-town.agent.anticipation.simulator
---
