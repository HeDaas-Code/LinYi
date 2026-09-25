---
uid: f4d7070d
id: truman-town-flow.state.area.survival.initialized-048bc601
parent: truman-town-flow.state.area.survival
name: {zh: "initialized", en: "initialized"}
description:
  zh: >
      flag 类型，声明于 src/survival/environment/radiation.js:28。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      flag declared at src/survival/environment/radiation.js:28; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "initialized-048bc601:write-ensure"
    description:
      zh: >
          写入方 ensure（src/survival/environment/radiation.js）
          
      en: >
          writer ensure
          
  - protocol: rpc
    path: "initialized-048bc601:write-configure"
    description:
      zh: >
          写入方 configure（src/survival/environment/radiation.js）
          
      en: >
          writer configure
          
  - protocol: rpc
    path: "initialized-048bc601:read-ensure"
    description:
      zh: >
          读取方 ensure
          
      en: >
          reader ensure
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.genesis.agent-factory.template
    from_api: "rpc:initialized-048bc601:read-ensure"
    label: {zh: "读 initialized", en: "read initialized"}
---
