---
uid: be90b668
id: truman-town-flow.state.area.agent.write-count-0535ab2a
parent: truman-town-flow.state.area.agent
name: {zh: "writeCount", en: "writeCount"}
description:
  zh: >
      number 类型，声明于 src/agent/traits/tagset/store.js:20。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/agent/traits/tagset/store.js:20; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:31.618Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "write-count-0535ab2a:write-upsert"
    description:
      zh: >
          写入方 upsert（src/agent/traits/tagset/store.js）
          
      en: >
          writer upsert
          
  - protocol: rpc
    path: "write-count-0535ab2a:read-__writeCount"
    description:
      zh: >
          读取方 __writeCount
          
      en: >
          reader __writeCount
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.traits.tagset.store
    from_api: "rpc:write-count-0535ab2a:read-__writeCount"
    label: {zh: "读 writeCount", en: "read writeCount"}
---
