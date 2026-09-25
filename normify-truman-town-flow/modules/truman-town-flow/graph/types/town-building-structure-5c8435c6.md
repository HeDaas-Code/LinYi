---
uid: 86c007a2
id: truman-town-flow.graph.types.town-building-structure-5c8435c6
parent: truman-town-flow.graph.types
name: {zh: "town.building.structure", en: "town.building.structure"}
description:
  zh: >
      声明于 undefined:undefined。生产者 2 个，消费者 3 个。
  en: >
      Declared at undefined:undefined; producers=2, consumers=3
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "town-building-structure-5c8435c6:write.src_agent_crafting_construction_js"
    description:
      zh: >
          生产者 src/agent/crafting/construction.js
      en: >
          producer src/agent/crafting/construction.js
  - protocol: rpc
    path: "town-building-structure-5c8435c6:write.src_town_building_structure_js"
    description:
      zh: >
          生产者 src/town/building/structure.js
      en: >
          producer src/town/building/structure.js
  - protocol: rpc
    path: "town-building-structure-5c8435c6:read.src_runtime_orchestrator__stage2_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/_stage2.js
      en: >
          consumer src/runtime/orchestrator/_stage2.js
  - protocol: rpc
    path: "town-building-structure-5c8435c6:read.src_runtime_orchestrator_loop_js"
    description:
      zh: >
          消费者 src/runtime/orchestrator/loop.js
      en: >
          consumer src/runtime/orchestrator/loop.js
  - protocol: rpc
    path: "town-building-structure-5c8435c6:read.src_town_building_structure_js"
    description:
      zh: >
          消费者 src/town/building/structure.js
      en: >
          consumer src/town/building/structure.js
---
