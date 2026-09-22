---
uid: 593eaa60
id: truman-town.social.politics.conflict
parent: truman-town.social.politics
name: {zh: "冲突", en: "Conflict"}
description:
  zh: >
      派系或个体间从口角到械斗的冲突，消耗资源并可能造成伤亡。
      
  en: >
      Conflicts from arguments to faction fights, costing resources and lives.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:28:10.152Z"
fingerprint: a0042c6353cbc7f6010a2fd7f5b1376c545a8ee8537dd83632b347bfb749abbe
source:
  - path: "src/social/politics/conflict.js"
apis:
  - protocol: rpc
    path: "social.politics.conflict.start"
    description:
      zh: >
          开启冲突。
          
      en: >
          Starts a conflict.
          
  - protocol: rpc
    path: "social.politics.conflict.resolve"
    description:
      zh: >
          解决冲突（升级/调停/和解）。
          
      en: >
          Resolves a conflict (escalate/mediate/settle).
          
deps:
  - kind: call
    to: truman-town.social.politics.faction
  - kind: call
    to: truman-town.survival.needs.pressure
  - kind: call
    to: truman-town.agent.lifecycle
---
