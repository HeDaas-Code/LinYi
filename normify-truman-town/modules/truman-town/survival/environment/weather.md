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
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.838Z"
fingerprint: e453db20364517c803422f1933856ac8e604ee43e6b838c2251b03bc0fc2b9d0
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
