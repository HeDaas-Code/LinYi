---
uid: 448e8cce
id: truman-town.agent.anticipation.simulator
parent: truman-town.agent.anticipation
name: {zh: "行动模拟", en: "Action Simulator"}
description:
  zh: >
      对候选行动做结果模拟与效用评分。
      
  en: >
      Simulates candidate action outcomes and scores their utility.
      
revision: 159dc43daf11d18b03ea9fc0ea5c3e6b18f16488
updated_at: "2026-09-24T02:49:57.817Z"
fingerprint: 29c83b4baf35c9149b82eb13d56a846b393371cc8f37a78595a133068f009ada
source:
  - path: "src/agent/anticipation/simulator.js"
apis:
  - protocol: rpc
    path: "agent.anticipation.simulator.simulate"
    description:
      zh: >
          推演单个候选行动，输出期望效用与风险。
          
      en: >
          Simulates one candidate action, outputs expected utility and risk.
          
  - protocol: rpc
    path: "agent.anticipation.simulator.predict"
    description:
      zh: >
          推演全部候选并按期望效用降序预测。
          
      en: >
          Simulates all candidates and predicts by expected utility desc.
          
deps:
  - kind: dataflow
    to: truman-town.agent.memory.semantic
---
