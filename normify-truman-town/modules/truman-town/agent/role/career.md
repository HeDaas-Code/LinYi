---
uid: c79f8e54
id: truman-town.agent.role.career
parent: truman-town.agent.role
state: planned
name: {zh: "职业角色", en: "Career Role"}
description:
  zh: >
      分配与释放职业身份，连接就业市场与产业。
  en: >
      Assigns and releases occupations linked to labour and industry.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent.role.career.assign"
    description:
      zh: >
          调用 agent.role.career.assign。
      en: >
          Calls agent.role.career.assign.
  - protocol: rpc
    path: "agent.role.career.release"
    description:
      zh: >
          调用 agent.role.career.release。
      en: >
          Calls agent.role.career.release.
deps:
  - kind: call
    to: truman-town.economy.industry.labour
  - kind: call
    to: truman-town.economy.industry.business
---
