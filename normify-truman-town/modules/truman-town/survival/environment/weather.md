---
uid: 37acd886
id: truman-town.survival.environment.weather
parent: truman-town.survival.environment
name: {zh: "灾变天气", en: "Weather"}
description:
  zh: >
      作为探索结算与突发事件的影响因子，预测并施加灾变天气。
      
  en: >
      Forecasts and strikes with disasters as a factor for expedition resolution and events.
      
revision: 36ce55d9e3d8994abf455c13925f0c4f4a3f316c
updated_at: "2026-09-25T09:50:41.311Z"
fingerprint: ed1dffb012ebd0e5dee79cc50a574fd60dcae5fbb786c0cd3e9aaf2b78dfc782
source:
  - path: "src/survival/environment/weather.js"
apis:
  - protocol: rpc
    path: "survival.environment.weather.forecast"
    description:
      zh: >
          调用 survival.environment.weather.forecast。
          
      en: >
          Calls survival.environment.weather.forecast.
          
  - protocol: rpc
    path: "survival.environment.weather.strike"
    description:
      zh: >
          调用 survival.environment.weather.strike。
          
      en: >
          Calls survival.environment.weather.strike.
          
deps:
  - kind: call
    to: truman-town.survival.shelter
  - kind: call
    to: truman-town.survival.events.impact
---
