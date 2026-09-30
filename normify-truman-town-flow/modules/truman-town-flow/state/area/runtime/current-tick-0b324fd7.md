---
uid: a3fc21f6
id: truman-town-flow.state.area.runtime.current-tick-0b324fd7
parent: truman-town-flow.state.area.runtime
name: {zh: "currentTick", en: "currentTick"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/stage-progress.js:40。写入方 3 个、读取方 4 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/stage-progress.js:40; writers=3, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "current-tick-0b324fd7:write-begin"
    description:
      zh: >
          写入方 begin（src/runtime/orchestrator/stage-progress.js）
          
      en: >
          writer begin
          
  - protocol: rpc
    path: "current-tick-0b324fd7:write-commit"
    description:
      zh: >
          写入方 commit（src/runtime/orchestrator/stage-progress.js）
          
      en: >
          writer commit
          
  - protocol: rpc
    path: "current-tick-0b324fd7:write-fail"
    description:
      zh: >
          写入方 fail（src/runtime/orchestrator/stage-progress.js）
          
      en: >
          writer fail
          
  - protocol: rpc
    path: "current-tick-0b324fd7:read-unit"
    description:
      zh: >
          读取方 unit
          
      en: >
          reader unit
          
  - protocol: rpc
    path: "current-tick-0b324fd7:read-commit"
    description:
      zh: >
          读取方 commit
          
      en: >
          reader commit
          
  - protocol: rpc
    path: "current-tick-0b324fd7:read-fail"
    description:
      zh: >
          读取方 fail
          
      en: >
          reader fail
          
  - protocol: rpc
    path: "current-tick-0b324fd7:read-current"
    description:
      zh: >
          读取方 current
          
      en: >
          reader current
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage-progress
    from_api: "rpc:current-tick-0b324fd7:read-unit"
    label: {zh: "读 currentTick", en: "read currentTick"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage-progress
    from_api: "rpc:current-tick-0b324fd7:read-commit"
    label: {zh: "读 currentTick", en: "read currentTick"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage-progress
    from_api: "rpc:current-tick-0b324fd7:read-fail"
    label: {zh: "读 currentTick", en: "read currentTick"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage-progress
    from_api: "rpc:current-tick-0b324fd7:read-current"
    label: {zh: "读 currentTick", en: "read currentTick"}
---
