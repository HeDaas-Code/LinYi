/**
 * truman-town.agent — 智能体核心统一出口。
 *
 * 汇总 traits（tagset / inherit / evolution / similarity）、persona
 * （identity / motivation / personality）、lifecycle、anticipation.pool、
 * decision、memory.episodic、inventory（item / backpack）与 crafting
 * （recipe / workbench / construction / writing）等能力，供 runtime、
 * survival、ai、observer、api 等上层模块直接 import。
 */

import * as tagsetStore from './traits/tagset/store.js';
import * as tagsetSampler from './traits/tagset/sampler.js';
import * as inheritSampler from './traits/inherit/sampler.js';
import * as inheritValidator from './traits/inherit/validator.js';
import * as poolStore from './anticipation/pool/store.js';
import * as poolPruner from './anticipation/pool/pruner.js';
import * as simulator from './anticipation/simulator.js';
import * as poolSelector from './anticipation/pool/selector.js';
import * as decisionContext from './decision/context.js';
import * as decisionSelector from './decision/selector.js';
import * as explainer from './decision/explainer.js';
import * as candidates from './decision/candidates.js';
import * as episodicStore from './memory/episodic/store.js';
import * as episodicRecaller from './memory/episodic/recaller.js';
import * as semantic from './memory/semantic.js';
import * as item from './inventory/item.js';
import * as backpack from './inventory/backpack.js';
import * as recipe from './crafting/recipe.js';
import * as validator from './crafting/workbench/validator.js';
import * as executor from './crafting/workbench/executor.js';
import * as output from './crafting/workbench/output.js';
import * as construction from './crafting/construction.js';
import * as writing from './crafting/writing.js';
import * as trauma from './psyche/trauma.js';
import * as coping from './psyche/coping.js';
import * as breakModule from './psyche/break.js';
import * as identity from './persona/identity.js';
import * as motivation from './persona/motivation.js';
import * as personality from './persona/personality.js';
import * as lifecycle from './lifecycle.js';
import * as evolution from './traits/evolution.js';
import * as similarity from './traits/tagset/similarity.js';
import * as schedulePlanner from './schedule/planner.js';
import * as scheduleExecutor from './schedule/executor.js';
import * as career from './role/career.js';
import * as society from './role/society.js';

export const traits = {
  tagset: { store: tagsetStore, sampler: tagsetSampler, similarity },
  inherit: { sampler: inheritSampler, validator: inheritValidator },
  evolution,
};

export const persona = { identity, motivation, personality };

export { lifecycle };

export const anticipation = {
  pool: { store: poolStore, selector: poolSelector, pruner: poolPruner },
  simulator,
};

export const decision = {
  context: decisionContext,
  selector: decisionSelector,
  explainer,
  candidates,
};

export const memory = {
  episodic: { store: episodicStore, recaller: episodicRecaller },
  semantic,
};

export const inventory = {
  item,
  backpack,
};

export const crafting = {
  recipe,
  workbench: { validator, executor, output },
  construction,
  writing,
};

export const psyche = { trauma, coping, break: breakModule };

export const schedule = { planner: schedulePlanner, executor: scheduleExecutor };

export const role = { career, society };
