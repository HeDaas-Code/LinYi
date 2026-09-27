---
uid: d0f5b847
id: truman-town-flow.state.area.survival.current-ee9fa3e5
parent: truman-town-flow.state.area.survival
name: {zh: "current", en: "current"}
description:
  zh: >
      null 类型，声明于 src/survival/environment/weather.js:41。写入方 2 个、读取方 4 个；已纳入复位。
      
  en: >
      null declared at src/survival/environment/weather.js:41; writers=2, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "current-ee9fa3e5:write-__restore"
    description:
      zh: >
          写入方 __restore（src/survival/environment/weather.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "current-ee9fa3e5:write-forecast"
    description:
      zh: >
          写入方 forecast（src/survival/environment/weather.js）
          
      en: >
          writer forecast
          
  - protocol: rpc
    path: "current-ee9fa3e5:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "current-ee9fa3e5:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
  - protocol: rpc
    path: "current-ee9fa3e5:read-forecast"
    description:
      zh: >
          读取方 forecast
          
      en: >
          reader forecast
          
  - protocol: rpc
    path: "current-ee9fa3e5:read-strike"
    description:
      zh: >
          读取方 strike
          
      en: >
          reader strike
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:current-ee9fa3e5:read-__snapshot"
    label: {zh: "读 current", en: "read current"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:current-ee9fa3e5:read-__restore"
    label: {zh: "读 current", en: "read current"}
  - kind: dataflow
    to: truman-town-flow.code.survival.environment.weather
    from_api: "rpc:current-ee9fa3e5:read-forecast"
    label: {zh: "读 current", en: "read current"}
  - kind: dataflow
    to: truman-town-flow.code.survival.environment.weather
    from_api: "rpc:current-ee9fa3e5:read-strike"
    label: {zh: "读 current", en: "read current"}
---
