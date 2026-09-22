/**
 * truman-town.town — 小镇空间统一出口。
 *
 * 汇总 map(topology/zoning)、building(structure/space)、residence 与
 * facility(venue)，用结构化数据组织避难所空间，支持居民分配、初始避难所
 * 生成与容量管理。
 */

import * as topology from './map/topology.js';
import * as zoning from './map/zoning.js';
import * as structure from './building/structure.js';
import * as space from './building/space.js';
import * as residence from './residence.js';
import * as venue from './facility/venue.js';

export const map = { topology, zoning };
export const building = { structure, space };
export { residence, venue };
