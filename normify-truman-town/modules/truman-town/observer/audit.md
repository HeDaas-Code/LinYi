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
      
revision: 796aec9412d132997f5cdc37d01cac934e03d018
updated_at: "2026-09-25T10:03:44.359Z"
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
