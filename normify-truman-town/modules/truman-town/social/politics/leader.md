---
uid: bdc1c15a
id: truman-town.social.politics.leader
parent: truman-town.social.politics
name: {zh: "领导", en: "Leader"}
description:
  zh: >
      推举、罢免领导者，并由其发布政令。
      
  en: >
      Elects and ousts leaders who issue decrees.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:28:10.151Z"
fingerprint: 69d692516f7e71ae5159015290004079ffad63790f7e8b7d72a86598918cbe0e
source:
  - path: "src/social/politics/leader.js"
apis:
  - protocol: rpc
    path: "social.politics.leader.elect"
    description:
      zh: >
          选举领导（支持度更高者更替）。
          
      en: >
          Elects a leader (higher support replaces).
          
  - protocol: rpc
    path: "social.politics.leader.oust"
    description:
      zh: >
          罢免领导。
          
      en: >
          Ousts the leader.
          
  - protocol: rpc
    path: "social.politics.leader.decree"
    description:
      zh: >
          领导发布政令。
          
      en: >
          Leader issues a decree.
          
deps:
  - kind: call
    to: truman-town.social.reputation
  - kind: call
    to: truman-town.social.politics.faction
---
