---
uid: "51844961"
id: truman-town.observer.experiment.compare
parent: truman-town.observer.experiment
name: {zh: "跨文明对比", en: "Civilization Compare"}
description:
  zh: >
      比较历代文明的存活时长、崩溃方式与遗产，只读文明存档。
      
  en: >
      Compares survival times, collapse modes and legacies across civilizations; read-only over archives.
      
revision: 5ad9af8b020cb978dad9c8ac59c41cdb224d5c73
updated_at: "2026-09-26T03:35:08.522Z"
fingerprint: cee92fb24030c2c7fa2dec1387516a0f4e00a36207d42699f67737d5fa7a8f8f
source:
  - path: "src/observer/experiment/compare.js"
apis:
  - protocol: rpc
    path: "observer.experiment.compare.civilizations"
    description:
      zh: >
          读取全部文明存档并按存活时长降序返回。
          
      en: >
          Reads all civ archives sorted by survival desc.
          
  - protocol: rpc
    path: "observer.experiment.compare.metrics"
    description:
      zh: >
          对存档记录做存活/崩溃/遗产聚合统计。
          
      en: >
          Aggregates survival/collapse/legacy metrics over archive records.
          
deps:
  - kind: dataflow
    to: truman-town.infra.store.archive
    label: {zh: "文明存档数据源", en: "Civ archive source"}
  - kind: call
    to: truman-town.infra.store.graph
    label: {zh: "读取文明存档", en: "Read civ archives"}
---
