---
uid: bbece836
id: truman-town.runtime.registry
parent: truman-town.runtime
name: {zh: "实体注册表", en: "Entity Registry"}
description:
  zh: >
      登记智能体、建筑、企业等实体，提供查找与注销能力。
      
  en: >
      Registers agents, buildings and businesses with lookup and unregister support.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:14:27.005Z"
fingerprint: 23c6d599b8188c345f8184b3a63d70b49da4966d7bb09bd97edca0ac080cdfc1
source:
  - path: "src/runtime/registry.js"
apis:
  - protocol: rpc
    path: "runtime.registry.register"
    description:
      zh: >
          幂等登记一个实体（id/type/data），返回实体快照。
          
      en: >
          Idempotently registers an entity (id/type/data) and returns its snapshot.
          
  - protocol: rpc
    path: "runtime.registry.lookup"
    description:
      zh: >
          按 id、type 或无条件查找实体。
          
      en: >
          Looks up entities by id, type, or unconditionally.
          
  - protocol: rpc
    path: "runtime.registry.unregister"
    description:
      zh: >
          注销指定 id 的实体，返回被注销实体或 null。
          
      en: >
          Unregisters the entity with the given id, returning it or null.
          
---
