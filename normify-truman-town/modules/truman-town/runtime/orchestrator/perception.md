---
uid: afb76d72
id: truman-town.runtime.orchestrator.perception
parent: truman-town.runtime.orchestrator
name: {zh: "感知分发", en: "Perception Dispatch"}
description:
  zh: >
      采集世界事件并分发给相关智能体，形成可感知上下文。
      
  en: >
      Collects world events and routes them to relevant agents as percepts.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.837Z"
fingerprint: 5422105dc2476c0f37c80c1958240e8134bdf1773da653d954e965d9e93cd291
source:
  - path: "src/runtime/orchestrator/perception.js"
apis:
  - protocol: rpc
    path: "runtime.orchestrator.perception.collect"
    description:
      zh: >
          归一化并暂存一批世界事件，形成 percept。
          
      en: >
          Normalizes and stages a batch of world events into percepts.
          
  - protocol: rpc
    path: "runtime.orchestrator.perception.route"
    description:
      zh: >
          把 percept 按 targets 或全体 agent 分组，返回每个智能体的感知收件箱。
          
      en: >
          Routes percepts to targeted or all agents, returning each agent's perception inbox.
          
deps:
  - kind: call
    to: truman-town.runtime.registry
---
