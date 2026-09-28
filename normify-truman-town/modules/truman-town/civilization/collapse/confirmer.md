---
uid: 2824cbea
id: truman-town.civilization.collapse.confirmer
parent: truman-town.civilization.collapse
name: {zh: "崩溃确认器", en: "Collapse Confirmer"}
description:
  zh: >
      确认集体性崩溃并写入观察者日志。
      
  en: >
      Confirms collective collapse and writes the observer log.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.833Z"
fingerprint: e196c8a8d3d08e23ed7c950c99c50d009e91319ee938503c1409a6ac95bc08b5
source:
  - path: "src/civilization/collapse/confirmer.js"
apis:
  - protocol: rpc
    path: "civilization.collapse.confirmer.confirm"
    description:
      zh: >
          调用 civilization.collapse.confirmer.confirm。
          
      en: >
          Calls civilization.collapse.confirmer.confirm.
          
  - protocol: rpc
    path: "civilization.collapse.confirmer.override"
    description:
      zh: >
          调用 civilization.collapse.confirmer.override。
          
      en: >
          Calls civilization.collapse.confirmer.override.
          
deps:
  - kind: call
    to: truman-town.civilization.collapse.detector
  - kind: call
    to: truman-town.observer.recorder
---
