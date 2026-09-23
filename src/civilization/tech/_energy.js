/**
 * 内部共享：能源库存（不作为 Normify 模块暴露）。
 *
 * 复用 survival/resources/energy.js 的同一库存节点（kind=energy，id=resource:energy），
 * 与食物/水源同构。research 经由本模块消耗 / 查询能源；survival.resources.energy
 * 即为此节点的权威门面，本模块仅作薄转发，避免两套能源库存互相矛盾。
 */

import { produce, consume, query, decay, __reset } from '../../survival/resources/energy.js';

export { produce, consume, query, decay, __reset };

