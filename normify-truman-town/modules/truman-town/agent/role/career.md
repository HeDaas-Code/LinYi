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
      
revision: e350da98bb80d56a99c3c70b9cd269a351113026
updated_at: "2026-09-24T03:13:06.630Z"
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
