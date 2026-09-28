---
uid: 7f9eac1b
id: truman-town.social.culture.norms
parent: truman-town.social.culture
name: {zh: "社会规范", en: "Norms"}
description:
  zh: >
      定义被接受/禁止的行为规范，随违规与舆论漂移；违规施加社会压力约束行为。
      
  en: >
      Defines accepted/forbidden norms that drift with violations; violations apply social pressure that constrains behavior.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.837Z"
fingerprint: e287c0d29a52ef43766422c60541749e4d43c1edcb3de668750d3eb0a24f567d
source:
  - path: "src/social/culture/norms.js"
apis:
  - protocol: rpc
    path: "social.culture.norms.update"
    description:
      zh: >
          定义或更新一条社会规范（接受/禁止 + 强度）。
          
      en: >
          Defines or updates a norm (accepted/forbidden + strength).
          
  - protocol: rpc
    path: "social.culture.norms.query"
    description:
      zh: >
          查询规范（单条或全量）。
          
      en: >
          Queries norms (single or all).
          
  - protocol: rpc
    path: "social.culture.norms.violate"
    description:
      zh: >
          记录违规并施加社会压力，写事件日志。
          
      en: >
          Records a violation, applies social pressure and writes the event log.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
    label: {zh: "持久化规范与压力", en: "Persist norms & pressure"}
  - kind: call
    to: truman-town.infra.identity
    label: {zh: "生成违规 ID", en: "Allocate violation id"}
  - kind: call
    to: truman-town.observer.recorder
    label: {zh: "写事件日志", en: "Write event log"}
---
