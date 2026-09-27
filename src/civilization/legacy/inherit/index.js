/**
 * truman-town.civilization.legacy.inherit — 遗产继承统一出口。
 *
 * 把上一代的物证（relic）转成下一代的真实能力：
 *   skill（技能） / tech head start（研究前提） / preference（行动偏好）
 * 每条能力都带可查询的来源链，且**可能读歪、可能丢失**。
 */

import * as skill from './skill.js';
import * as preference from './preference.js';
import * as applier from './applier.js';
import * as trace from './trace.js';

export { skill, preference, applier, trace };
