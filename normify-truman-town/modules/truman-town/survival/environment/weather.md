---
uid: 37acd886
id: truman-town.survival.environment.weather
parent: truman-town.survival.environment
state: planned
name: {zh: "灾变天气", en: "Weather"}
description:
  zh: >
      作为探索结算与突发事件的影响因子，预测并施加灾变天气。
  en: >
      Forecasts and strikes with disasters as a factor for expedition resolution and events.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:20:43Z"
fingerprint: pending
source: []
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
