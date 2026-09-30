---
uid: e3d0a8c3
id: truman-town.agent.traits.tagset.store
parent: truman-town.agent.traits.tagset
name: {zh: "特质存储", en: "Tag Store"}
description:
  zh: >
      持久化读写单个智能体的特质标签集（默认 50 个），支持对象或数组输入，读写均深拷贝隔离。
      
  en: >
      Persists an agent trait tag set (50 by default), accepting map or array input, with deep-copy isolation.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.832Z"
fingerprint: fd656aed6ef8f9e94be6af1a9bcd54d83aaab7a738d936940c673f53e7c1f479
source:
  - path: "src/agent/traits/tagset/store.js"
apis:
  - protocol: rpc
    path: "agent.traits.tagset.store.get"
    description:
      zh: >
          读取指定智能体的特质标签集；不存在返回 null。
          
      en: >
          Reads an agent tag set; returns null when missing.
          
  - protocol: rpc
    path: "agent.traits.tagset.store.upsert"
    description:
      zh: >
          写入（upsert）智能体的特质标签集并返回规范化快照。
          
      en: >
          Upserts an agent tag set and returns the normalized snapshot.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
