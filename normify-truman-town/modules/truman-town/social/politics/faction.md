---
uid: e488779b
id: truman-town.social.politics.faction
parent: truman-town.social.politics
name: {zh: "派系", en: "Faction"}
description:
  zh: >
      按生存策略、资源争夺或家族利益形成、加入与退出派系。
      
  en: >
      Forms, joins and leaves factions around survival strategy, resources or family interests.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:28:10.151Z"
fingerprint: e434feb01f1b91255c0cdbc424619399c50dc3afeaaec7472502f6466e946735
source:
  - path: "src/social/politics/faction.js"
apis:
  - protocol: rpc
    path: "social.politics.faction.form"
    description:
      zh: >
          创建派系（指定创始成员）。
          
      en: >
          Forms a faction (with a founding member).
          
  - protocol: rpc
    path: "social.politics.faction.join"
    description:
      zh: >
          加入派系。
          
      en: >
          Joins a faction.
          
  - protocol: rpc
    path: "social.politics.faction.leave"
    description:
      zh: >
          退出派系（无人时解散）。
          
      en: >
          Leaves a faction (dissolves when empty).
          
deps:
  - kind: call
    to: truman-town.social.graph.community
  - kind: call
    to: truman-town.agent.role.society
---
