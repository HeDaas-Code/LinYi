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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:24.455Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.observer.seq-62c22802
    to_api: "rpc:seq-62c22802:write-nextSeq"
    label: {zh: "写 seq", en: "write seq"}
---
