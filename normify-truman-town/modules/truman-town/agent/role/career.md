---
uid: c79f8e54
id: truman-town.agent.role.career
parent: truman-town.agent.role
name: {zh: "职业角色", en: "Career Role"}
description:
  zh: >
      分配与释放职业身份，连接就业市场与产业。
      
  en: >
      Assigns and releases occupations linked to labour and industry.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.832Z"
fingerprint: 51e4383a89ae1b86a5adb7674ce9312afe1988620ef7f319dad79277359a79d7
source:
  - path: "src/agent/role/career.js"
    line: 1
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
