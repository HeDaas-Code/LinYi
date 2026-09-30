---
uid: 91d38138
id: truman-town.survival.crisis
parent: truman-town.survival
name: {zh: "危机检测", en: "Crisis Detection"}
description:
  zh: >
      检测群体性生存危机并发出警报，为文明崩溃判定提供输入。
      
  en: >
      Detects collective survival crises and raises alerts for collapse judgement.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.838Z"
fingerprint: f0d0eb1991f6ae0d238507953f9b9195b503999e853e55e9f7eafa4ab5263515
source:
  - path: "src/survival/crisis.js"
apis:
  - protocol: rpc
    path: "survival.crisis.detect"
    description:
      zh: >
          调用 survival.crisis.detect。
          
      en: >
          Calls survival.crisis.detect.
          
  - protocol: rpc
    path: "survival.crisis.alert"
    description:
      zh: >
          调用 survival.crisis.alert。
          
      en: >
          Calls survival.crisis.alert.
          
deps:
  - kind: call
    to: truman-town.survival.needs.pressure
---
