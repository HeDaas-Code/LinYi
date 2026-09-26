---
uid: ea40fa03
id: truman-town.social.family.trait.detector
parent: truman-town.social.family.trait
name: {zh: "三代检测器", en: "Trait Detector"}
description:
  zh: >
      检测某 tag 是否在家族内连续遗传三代未遗失。
      
  en: >
      Detects whether a tag survived three generations without loss.
      
revision: 9f0996005124054052fc61d9ec3f762219e92a2c
updated_at: "2026-09-26T05:45:37.198Z"
fingerprint: 2d0eeffdd00957ddeee7628c686dc4cd25b38c309ba4d502fbb5946bf82c959f
source:
  - path: "src/social/family/trait/detector.js"
apis:
  - protocol: rpc
    path: "social.family.trait.detector.detect"
    description:
      zh: >
          调用 social.family.trait.detector.detect。
          
      en: >
          Calls social.family.trait.detector.detect.
          
  - protocol: rpc
    path: "social.family.trait.detector.three_generations"
    description:
      zh: >
          调用 social.family.trait.detector.three_generations。
          
      en: >
          Calls social.family.trait.detector.three_generations.
          
deps:
  - kind: dataflow
    to: truman-town.social.family.lineage
    label: {zh: "三代标签由谱系提供", en: "Generation tags from lineage"}
---
