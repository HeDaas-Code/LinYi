---
uid: d176f103
id: truman-town.social.procreation.match
parent: truman-town.social.procreation
name: {zh: "配对评估", en: "Match Evaluation"}
description:
  zh: >
      评估恋爱双方的契合度与繁衍条件。
      
  en: >
      Evaluates romantic compatibility and readiness for children.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T07:57:42.688Z"
fingerprint: 9660bf36285b6fd5a97a3c434405f20d0dd49ad4b55843793ba672689f4710ed
source:
  - path: "src/social/procreation/match.js"
apis:
  - protocol: rpc
    path: "social.procreation.match.evaluate"
    description:
      zh: >
          调用 social.procreation.match.evaluate。
          
      en: >
          Calls social.procreation.match.evaluate.
          
  - protocol: rpc
    path: "social.procreation.match.pair"
    description:
      zh: >
          调用 social.procreation.match.pair。
          
      en: >
          Calls social.procreation.match.pair.
          
deps:
  - kind: call
    to: truman-town.agent.traits.tagset.store
    label: {zh: "读取特质算相似度", en: "Read tagsets for similarity"}
  - kind: call
    to: truman-town.social.relationship.romance
    label: {zh: "读取恋爱纽带", en: "Read romance bond"}
---
