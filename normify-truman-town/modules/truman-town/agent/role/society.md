---
uid: d70581f4
id: truman-town.agent.role.society
parent: truman-town.agent.role
name: {zh: "公共角色", en: "Civic Role"}
description:
  zh: >
      承担镇长、店主、居民等公共身份并参与治理。
      
  en: >
      Holds civic identities such as mayor, shopkeeper or resident.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.832Z"
fingerprint: f2c6662332eaf56b23501011d3e2e4ec1fc4bfdc3b1f70761b7adf116f921d9f
source:
  - path: "src/agent/role/society.js"
    line: 1
apis:
  - protocol: rpc
    path: "agent.role.society.hold"
    description:
      zh: >
          调用 agent.role.society.hold。
          
      en: >
          Calls agent.role.society.hold.
          
  - protocol: rpc
    path: "agent.role.society.retire"
    description:
      zh: >
          调用 agent.role.society.retire。
          
      en: >
          Calls agent.role.society.retire.
          
---
