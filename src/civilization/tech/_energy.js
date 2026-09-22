/**
 * 内部共享：能源库存（不作为 Normify 模块暴露）。
 *
 * 复用 survival/resources/_resource.js 的 createResource 工厂，kind=energy，
 * 库存持久化在 graph store（type=survival.resource，id=resource:energy），
 * 与 food/water 同构。research 经由本模块消耗 / 查询能源；正式的
 * survival.resources.energy 模块落地后可直接复用同一节点。
 */

import { createResource } from '../../survival/resources/_resource.js';

const energy = createResource({ kind: 'energy', defaultStockpile: 100, defaultCapacity: 500 });

export const { produce, consume, query, decay, __reset } = energy;
