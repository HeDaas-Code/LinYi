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
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:36:04.466Z"
fingerprint: e453db20364517c803422f1933856ac8e604ee43e6b838c2251b03bc0fc2b9d0
source:
  - path: "src/survival/environment/weather.js"
apis:
  - protocol: rpc
    path: "survival.environment.weather.forecast"
    description:
      zh: >
          forecast：模块导出函数。
          
      en: >
          forecast: exported module function.
          
  - protocol: rpc
    path: "survival.environment.weather.strike"
    description:
      zh: >
          strike：模块导出函数。
          
      en: >
          strike: exported module function.
          
  - protocol: rpc
    path: "survival.environment.weather.describe"
    description:
      zh: >
          describe：模块导出函数。
          
      en: >
          describe: exported module function.
          
  - protocol: rpc
    path: "survival.environment.weather.modifiers"
    description:
      zh: >
          modifiers：模块导出函数。
          
      en: >
          modifiers: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.survival.current-ee9fa3e5
    to_api: "rpc:current-ee9fa3e5:write-forecast"
    label: {zh: "写 current", en: "write current"}
---
