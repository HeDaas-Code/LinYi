/**
 * truman-town.survival — 生存系统统一出口。
 *
 * 汇总 resources（food/water）、needs（meter/pressure.scorer/pressure.ranker）
 * 与 events（generator.roller/generator.selector/impact），供 runtime 主循环、
 * agent 决策与 api 控制直接 import，构成"资源衰减 → 需求缺口 → 压力评分 →
 * 影响决策"的生存压力闭环。
 */

import * as food from './resources/food.js';
import * as water from './resources/water.js';
import * as meter from './needs/meter.js';
import * as scorer from './needs/pressure/scorer.js';
import * as ranker from './needs/pressure/ranker.js';
import * as roller from './events/generator/roller.js';
import * as selector from './events/generator/selector.js';
import * as impact from './events/impact.js';
import * as disease from './health/disease.js';
import * as treatment from './health/treatment.js';
import * as epidemic from './health/epidemic.js';

export const resources = { food, water };

export const needs = {
  meter,
  pressure: { scorer, ranker },
};

export const events = {
  generator: { roller, selector },
  impact,
};

export const health = { disease, treatment, epidemic };
