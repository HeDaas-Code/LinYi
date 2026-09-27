---
uid: 3dc21bf2
id: truman-town-flow.state.area.survival.quarantined-7d0301dd
parent: truman-town-flow.state.area.survival
name: {zh: "quarantined", en: "quarantined"}
description:
  zh: >
      set 类型，声明于 src/survival/health/epidemic.js:14。写入方 3 个、读取方 6 个；已纳入复位。
      
  en: >
      set declared at src/survival/health/epidemic.js:14; writers=3, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "quarantined-7d0301dd:write-quarantine"
    description:
      zh: >
          写入方 quarantine（src/survival/health/epidemic.js）
          
      en: >
          writer quarantine
          
  - protocol: rpc
    path: "quarantined-7d0301dd:write-release"
    description:
      zh: >
          写入方 release（src/survival/health/epidemic.js）
          
      en: >
          writer release
          
  - protocol: rpc
    path: "quarantined-7d0301dd:write-__restore"
    description:
      zh: >
          写入方 __restore（src/survival/health/epidemic.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "quarantined-7d0301dd:read-quarantine"
    description:
      zh: >
          读取方 quarantine
          
      en: >
          reader quarantine
          
  - protocol: rpc
    path: "quarantined-7d0301dd:read-isQuarantined"
    description:
      zh: >
          读取方 isQuarantined
          
      en: >
          reader isQuarantined
          
  - protocol: rpc
    path: "quarantined-7d0301dd:read-listQuarantined"
    description:
      zh: >
          读取方 listQuarantined
          
      en: >
          reader listQuarantined
          
  - protocol: rpc
    path: "quarantined-7d0301dd:read-release"
    description:
      zh: >
          读取方 release
          
      en: >
          reader release
          
  - protocol: rpc
    path: "quarantined-7d0301dd:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "quarantined-7d0301dd:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.survival.health.epidemic
    from_api: "rpc:quarantined-7d0301dd:read-quarantine"
    label: {zh: "读 quarantined", en: "read quarantined"}
  - kind: dataflow
    to: truman-town-flow.code.survival.health.epidemic
    from_api: "rpc:quarantined-7d0301dd:read-isQuarantined"
    label: {zh: "读 quarantined", en: "read quarantined"}
  - kind: dataflow
    to: truman-town-flow.code.survival.health.epidemic
    from_api: "rpc:quarantined-7d0301dd:read-listQuarantined"
    label: {zh: "读 quarantined", en: "read quarantined"}
  - kind: dataflow
    to: truman-town-flow.code.survival.health.epidemic
    from_api: "rpc:quarantined-7d0301dd:read-release"
    label: {zh: "读 quarantined", en: "read quarantined"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:quarantined-7d0301dd:read-__snapshot"
    label: {zh: "读 quarantined", en: "read quarantined"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:quarantined-7d0301dd:read-__restore"
    label: {zh: "读 quarantined", en: "read quarantined"}
---
