---
uid: a72b8fab
id: truman-town.observer.audit
parent: truman-town.observer
name: {zh: "决策审计", en: "Decision Audit"}
description:
  zh: >
      回溯单个智能体的决策链，并对比不同个体的行为差异。
      
  en: >
      Traces individual decision chains and compares behavior across agents.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.836Z"
fingerprint: 51d20f39a7090ebf0a0ef330b4074a088767c5c6f5327944784e4db93f203e8d
source:
  - path: "src/observer/audit.js"
apis:
  - protocol: rpc
    path: "observer.audit.trace"
    description:
      zh: >
          调用 observer.audit.trace。
          
      en: >
          Calls observer.audit.trace.
          
  - protocol: rpc
    path: "observer.audit.compare"
    description:
      zh: >
          调用 observer.audit.compare。
          
      en: >
          Calls observer.audit.compare.
          
deps:
  - kind: dataflow
    to: truman-town.observer.recorder
---
