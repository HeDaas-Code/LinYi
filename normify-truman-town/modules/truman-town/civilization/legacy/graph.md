---
uid: 7487729a
id: truman-town.civilization.legacy.graph
parent: truman-town.civilization.legacy
name: {zh: "历史图谱", en: "Legacy Graph"}
description:
  zh: >
      把当前文明的全部历史和所作所为汇总为知识图谱。
      
  en: >
      Summarizes all history and deeds of the current civilization into a knowledge graph.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:39:19.572Z"
fingerprint: e4ddc5a26b26b877703ad11242e9b7de0ff3357b7dd094532f56569240719910
source:
  - path: "src/civilization/legacy/graph.js"
apis:
  - protocol: rpc
    path: "civilization.legacy.graph.build"
    description:
      zh: >
          调用 civilization.legacy.graph.build。
          
      en: >
          Calls civilization.legacy.graph.build.
          
  - protocol: rpc
    path: "civilization.legacy.graph.query"
    description:
      zh: >
          调用 civilization.legacy.graph.query。
          
      en: >
          Calls civilization.legacy.graph.query.
          
deps:
  - kind: dataflow
    to: truman-town.observer.chronicle
  - kind: dataflow
    to: truman-town.social.culture.norms
  - kind: dataflow
    to: truman-town.social.politics.law
  - kind: dataflow
    to: truman-town.civilization.tech.tree
---
