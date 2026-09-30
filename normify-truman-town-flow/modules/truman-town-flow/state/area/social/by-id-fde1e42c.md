---
uid: 4d5e6e8d
id: truman-town-flow.state.area.social.by-id-fde1e42c
parent: truman-town-flow.state.area.social
name: {zh: "byId", en: "byId"}
description:
  zh: >
      map 类型，声明于 src/social/platform/posts.js:32。写入方 3 个、读取方 6 个；已纳入复位。
      
  en: >
      map declared at src/social/platform/posts.js:32; writers=3, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "by-id-fde1e42c:write-rebuildFromGraph"
    description:
      zh: >
          写入方 rebuildFromGraph（src/social/platform/posts.js）
          
      en: >
          writer rebuildFromGraph
          
  - protocol: rpc
    path: "by-id-fde1e42c:write-__restore"
    description:
      zh: >
          写入方 __restore（src/social/platform/posts.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "by-id-fde1e42c:write-publish"
    description:
      zh: >
          写入方 publish（src/social/platform/posts.js）
          
      en: >
          writer publish
          
  - protocol: rpc
    path: "by-id-fde1e42c:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "by-id-fde1e42c:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
  - protocol: rpc
    path: "by-id-fde1e42c:read-reply"
    description:
      zh: >
          读取方 reply
          
      en: >
          reader reply
          
  - protocol: rpc
    path: "by-id-fde1e42c:read-react"
    description:
      zh: >
          读取方 react
          
      en: >
          reader react
          
  - protocol: rpc
    path: "by-id-fde1e42c:read-get"
    description:
      zh: >
          读取方 get
          
      en: >
          reader get
          
  - protocol: rpc
    path: "by-id-fde1e42c:read-list"
    description:
      zh: >
          读取方 list
          
      en: >
          reader list
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:by-id-fde1e42c:read-__snapshot"
    label: {zh: "读 byId", en: "read byId"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:by-id-fde1e42c:read-__restore"
    label: {zh: "读 byId", en: "read byId"}
  - kind: dataflow
    to: truman-town-flow.code.social.platform.posts
    from_api: "rpc:by-id-fde1e42c:read-reply"
    label: {zh: "读 byId", en: "read byId"}
  - kind: dataflow
    to: truman-town-flow.code.social.platform.posts
    from_api: "rpc:by-id-fde1e42c:read-react"
    label: {zh: "读 byId", en: "read byId"}
  - kind: dataflow
    to: truman-town-flow.code.agent.traits.tagset.store
    from_api: "rpc:by-id-fde1e42c:read-get"
    label: {zh: "读 byId", en: "read byId"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-id-fde1e42c:read-list"
    label: {zh: "读 byId", en: "read byId"}
---
