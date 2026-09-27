---
uid: 6e916a70
id: truman-town-flow.code.survival.environment.weather
parent: truman-town-flow.code.survival.environment
name: {zh: "survival/environment/weather.js", en: "survival/environment/weather.js"}
description:
  zh: >
      代码模块 src/survival/environment/weather.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/survival/environment/weather.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:24.455Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.survival.current-ee9fa3e5
    to_api: "rpc:current-ee9fa3e5:write-forecast"
    label: {zh: "写 current", en: "write current"}
---
