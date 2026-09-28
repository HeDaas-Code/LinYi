---
uid: 2fa90f26
id: truman-town-flow.code.observer.recorder.shared
parent: truman-town-flow.code.observer.recorder
name: {zh: "observer/recorder/_shared.js", en: "observer/recorder/_shared.js"}
description:
  zh: >
      代码模块 src/observer/recorder/_shared.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/observer/recorder/_shared.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:52.612Z"
fingerprint: bc85606102a78ed4eea341c60945e15d5d378cb18d16eb5128d02fafd3a0ef45
source:
  - path: "src/observer/recorder/_shared.js"
apis:
  - protocol: rpc
    path: "observer.recorder._shared.nextSeq"
    description:
      zh: >
          nextSeq：模块导出函数。
          
      en: >
          nextSeq: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.observer.seq-62c22802
    to_api: "rpc:seq-62c22802:write-nextSeq"
    label: {zh: "写 seq", en: "write seq"}
---
