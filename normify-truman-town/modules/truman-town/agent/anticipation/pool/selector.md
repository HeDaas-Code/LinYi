---
uid: c59d7120
id: truman-town.agent.anticipation.pool.selector
parent: truman-town.agent.anticipation.pool
name: {zh: "候选选择器", en: "Candidate Selector"}
description:
  zh: >
      按模拟评分生成候选短名单。**生存骨架（eat/drink/rest/forage）免疫截断**，且 found/socialize/court/accept 保送独立席位——纯按分数截断会让基础分低的刚需行动被挤出窗口（实测后果：全镇不再采集、食水归零、存活率崩溃）。这是决策带宽的第一道闸。
      
  en: >
      Shortlists pool candidates by simulated score. **Survival spine (eat/drink/rest/forage) is exempt from truncation**, and found/socialize/court/accept get reserved seats; pure score truncation evicts low-base-score necessities (measured: settlement stops foraging, supplies hit zero, survival collapses). First of two decision-bandwidth gates.
      
revision: 45f6c8b7b8ba210fcd94506b2097c8e601dd1382
updated_at: "2026-09-26T01:44:47.422Z"
fingerprint: 9f98bae0723d0753ca4b7fb25ae3010b7747fd4675bd504df2a6dadff184784e
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
          生成候选短名单：先保送生存骨架与发展行动，再按评分降序填充剩余名额。
          
      en: >
          Builds the shortlist: reserves survival spine and development actions first, then fills remaining seats by score desc.
          
deps:
  - kind: call
    to: truman-town.agent.anticipation.pool.store
  - kind: call
    to: truman-town.agent.anticipation.simulator
---
