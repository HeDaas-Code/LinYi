/**
 * truman-town.social — 社交系统出口
 *
 * 聚合关系（relationship）、繁衍（procreation）、家族（family）与关系图（graph）子域，
 * 供 runtime / api 上层 import。批次2-D 新增：家族登记/编年史/家庭关系 + 关系边/社区发现。
 */

import * as friendship from './relationship/friendship.js';
import * as romance from './relationship/romance.js';
import * as familyRelationship from './relationship/family.js';
import * as match from './procreation/match.js';
import * as offspring from './procreation/offspring.js';
import * as lineage from './family/lineage.js';
import * as familyRegistry from './family/registry.js';
import * as familyChronicle from './family/chronicle.js';
import * as inheritApplier from './family/inherit/applier.js';
import * as inheritVerifier from './family/inherit/verifier.js';
import * as traitDetector from './family/trait/detector.js';
import * as traitEnforcer from './family/trait/enforcer.js';
import * as graphEdges from './graph/edges.js';
import * as graphCommunity from './graph/community.js';
import * as culture from './culture/index.js';
import * as politics from './politics/index.js';

export const relationship = { friendship, romance, family: familyRelationship };
export const procreation = { match, offspring };
export const family = {
  lineage,
  registry: familyRegistry,
  chronicle: familyChronicle,
  inherit: { applier: inheritApplier, verifier: inheritVerifier },
  trait: { detector: traitDetector, enforcer: traitEnforcer },
};
export const graph = { edges: graphEdges, community: graphCommunity };

export { culture };
export { politics };

