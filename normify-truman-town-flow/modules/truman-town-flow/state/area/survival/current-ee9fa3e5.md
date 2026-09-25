---
uid: d0f5b847
id: truman-town-flow.state.area.survival.current-ee9fa3e5
parent: truman-town-flow.state.area.survival
name: {zh: "current", en: "current"}
description:
  zh: >
      null 类型，声明于 src/survival/environment/weather.js:41。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      null declared at src/survival/environment/weather.js:41; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "current-ee9fa3e5:write-forecast"
    description:
      zh: >
          写入方 forecast（src/survival/environment/weather.js）
          
      en: >
          writer forecast
          
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
    to: truman-town-flow.code.survival.environment.weather
    from_api: "rpc:current-ee9fa3e5:read-forecast"
    label: {zh: "读 current", en: "read current"}
  - kind: dataflow
    to: truman-town-flow.code.survival.environment.weather
    from_api: "rpc:current-ee9fa3e5:read-strike"
    label: {zh: "读 current", en: "read current"}
---
