---
uid: 2270e6b5
id: truman-town.agent.psyche.trauma
parent: truman-town.agent.psyche
name: {zh: "创伤", en: "Trauma"}
description:
  zh: >
      记录亲人死亡、饥荒、冲突等造成的心理创伤并支持疗愈。
      
  en: >
      Records trauma from deaths, famine and conflict, with healing support.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:25:36.976Z"
fingerprint: ea26c6407d384cced17ab969e4690dca11e51f2ae4476ffafb7499f1b1bbec28
source:
  - path: "src/agent/psyche/trauma.js"
apis:
  - protocol: rpc
    path: "agent.psyche.trauma.add"
    description:
      zh: >
          调用 agent.psyche.trauma.add。
          
      en: >
          Calls agent.psyche.trauma.add.
          
  - protocol: rpc
    path: "agent.psyche.trauma.query"
    description:
      zh: >
          调用 agent.psyche.trauma.query。
          
      en: >
          Calls agent.psyche.trauma.query.
          
  - protocol: rpc
    path: "agent.psyche.trauma.heal"
    description:
      zh: >
          调用 agent.psyche.trauma.heal。
          
      en: >
          Calls agent.psyche.trauma.heal.
          
deps:
  - kind: call
    to: truman-town.agent.memory.episodic.store
    label: {zh: "写入创伤记忆", en: "Write trauma memory"}
  - kind: call
    to: truman-town.survival.needs.pressure.scorer
    label: {zh: "读取生存压力累积创伤", en: "Accumulate trauma via pressure"}
  - kind: call
    to: truman-town.infra.store.graph
    label: {zh: "持久化创伤状态", en: "Persist trauma state"}
---
