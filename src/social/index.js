/**
 * truman-town.social — 社交系统出口
 *
 * 聚合关系（relationship）、繁衍（procreation）与家族（family）子域，
 * 供 runtime / api 上层 import。
 */

import * as friendship from './relationship/friendship.js';
import * as romance from './relationship/romance.js';
import * as match from './procreation/match.js';
import * as offspring from './procreation/offspring.js';
import * as lineage from './family/lineage.js';
import * as inheritApplier from './family/inherit/applier.js';
import * as inheritVerifier from './family/inherit/verifier.js';
import * as traitDetector from './family/trait/detector.js';
import * as traitEnforcer from './family/trait/enforcer.js';
import * as culture from './culture/index.js';
import * as politics from './politics/index.js';

export const relationship = { friendship, romance };
export const procreation = { match, offspring };
export const family = {
  lineage,
  inherit: { applier: inheritApplier, verifier: inheritVerifier },
  trait: { detector: traitDetector, enforcer: traitEnforcer },
};

export { culture };
export { politics };
