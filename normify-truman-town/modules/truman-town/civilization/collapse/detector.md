---
uid: 27759f9b
id: truman-town.civilization.collapse.detector
parent: truman-town.civilization.collapse
name: {zh: "崩溃检测器", en: "Collapse Detector"}
description:
  zh: >
      汇总生存危机与文明状态指标，检测崩溃信号。
      
  en: >
      Detects collapse signals from survival crisis and civilization metrics.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:39:19.573Z"
fingerprint: bcfabb6e33fbbcc8a0826dd1da11a6242c38061553c3e16ecebbb3b7bb4c8edb
source:
  - path: "src/civilization/collapse/detector.js"
apis:
  - protocol: rpc
    path: "civilization.collapse.detector.detect"
    description:
      zh: >
          调用 civilization.collapse.detector.detect。
          
      en: >
          Calls civilization.collapse.detector.detect.
          
  - protocol: rpc
    path: "civilization.collapse.detector.indicators"
    description:
      zh: >
          调用 civilization.collapse.detector.indicators。
          
      en: >
          Calls civilization.collapse.detector.indicators.
          
deps:
  - kind: call
    to: truman-town.survival.crisis
  - kind: call
    to: truman-town.civilization.state
---
