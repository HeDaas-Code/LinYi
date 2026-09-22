/**
 * 内部共享：医疗物资库存（不作为 Normify 模块暴露）。
 *
 * 复用 resources/_resource.js 的 createResource 工厂，kind=medical，
 * 库存持久化在 graph store（type=survival.resource，id=resource:medical），
 * 与 food/water 同构。disease / treatment 经由本模块消费 / 查询医疗物资；
 * 正式的 survival.resources.medical 模块落地后可直接复用同一节点。
 */

import { createResource } from '../resources/_resource.js';

const medical = createResource({ kind: 'medical', defaultStockpile: 100, defaultCapacity: 500 });

export const { produce, consume, query, decay, __reset } = medical;
