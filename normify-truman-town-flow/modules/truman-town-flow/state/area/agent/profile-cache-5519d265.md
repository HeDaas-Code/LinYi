---
uid: 7d35b627
id: truman-town-flow.state.area.agent.profile-cache-5519d265
parent: truman-town-flow.state.area.agent
name: {zh: "profileCache", en: "profileCache"}
description:
  zh: >
      map 类型，声明于 src/agent/persona/personality.js:53。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      map declared at src/agent/persona/personality.js:53; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "profile-cache-5519d265:write-ensureCacheFresh"
    description:
      zh: >
          写入方 ensureCacheFresh（src/agent/persona/personality.js）
          
      en: >
          writer ensureCacheFresh
          
  - protocol: rpc
    path: "profile-cache-5519d265:write-profile"
    description:
      zh: >
          写入方 profile（src/agent/persona/personality.js）
          
      en: >
          writer profile
          
  - protocol: rpc
    path: "profile-cache-5519d265:read-profile"
    description:
      zh: >
          读取方 profile
          
      en: >
          reader profile
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.persona.personality
    from_api: "rpc:profile-cache-5519d265:read-profile"
    label: {zh: "读 profileCache", en: "read profileCache"}
---
