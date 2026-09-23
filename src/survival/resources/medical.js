/**
 * truman-town.survival.resources.medical — 医疗物资 / Medical Supplies
 *
 * 医疗物资的公开门面：直接复用 health/_medical.js 的同一库存节点（kind=medical，
 * id=resource:medical），避免两套医疗库存互相矛盾。produce 增产、consume 消耗、
 * query 快照、decay 自然损耗，供 treatment 消费与 api 观测。
 */

import { produce, consume, query, decay, __reset } from '../health/_medical.js';

export { produce, consume, query, decay, __reset };

