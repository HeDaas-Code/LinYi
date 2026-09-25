/**
 * 内部共享：资源库存工厂（不作为 Normify 模块暴露）。
 *
 * 为 food / water 等资源提供一致的库存语义：produce 增产、consume 消耗
 *（实际消耗夹在 [0, stockpile]）、query 快照、decay 自然损耗。库存持久化在
 * graph store（type=survival.resource，id=resource:<kind>），便于 observer / api
 * 直接观测；所有读取返回深拷贝，避免调用方改写内部状态。
 */

import * as graph from '../../infra/store/graph.js';

const TYPE = 'survival.resource';

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export function createResource({ kind, defaultStockpile = 100, defaultCapacity = 500 }) {
  const NODE_ID = `resource:${kind}`;

  const defaults = () => ({
    kind,
    stockpile: defaultStockpile,
    capacity: defaultCapacity,
    totalProduced: 0,
    totalConsumed: 0,
  });

  function load() {
    const node = graph.read(NODE_ID);
    if (node && node.data && typeof node.data.stockpile === 'number') {
      return { ...defaults(), ...node.data, kind };
    }
    return defaults();
  }

  function save(state) {
    return graph.write({ id: NODE_ID, type: TYPE, data: state }).data;
  }

  function assertAmount(amount, name) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new TypeError(`${kind}.${name}: amount 必须为非负有限数值`);
    }
  }

  function scarcity(stockpile, capacity) {
    if (!(capacity > 0)) return 0;
    return clamp(1 - stockpile / capacity, 0, 1);
  }

  function snapshot(state) {
    return {
      kind: state.kind,
      stockpile: state.stockpile,
      capacity: state.capacity,
      totalProduced: state.totalProduced,
      totalConsumed: state.totalConsumed,
      scarcity: scarcity(state.stockpile, state.capacity),
    };
  }

  return {
    /** 增产：库存最多增至 capacity，返回实际增产后的库存快照。 */
    produce(amount = 1) {
      assertAmount(amount, 'produce');
      const state = load();
      const added = clamp(amount, 0, state.capacity - state.stockpile);
      state.stockpile += added;
      state.totalProduced += added;
      return { ...snapshot(save(state)), produced: added };
    },

    /** 消耗：库存至少减到 0，返回实际消耗量与剩余库存。 */
    consume(amount = 1) {
      assertAmount(amount, 'consume');
      const state = load();
      const taken = clamp(amount, 0, state.stockpile);
      state.stockpile -= taken;
      state.totalConsumed += taken;
      return { ...snapshot(save(state)), consumed: taken };
    },

    /** 查询库存快照（含稀缺度 scarcity = 1 - stockpile/capacity）。 */
    query() {
      return snapshot(load());
    },

    /** 自然损耗：按 rate ∈ [0,1] 比例减损库存，返回实际损耗量。 */
    decay(rate = 0) {
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1) {
        throw new TypeError(`${kind}.decay: rate 必须为 [0,1] 内的数值`);
      }
      const state = load();
      const loss = clamp(state.stockpile * rate, 0, state.stockpile);
      state.stockpile -= loss;
      return { ...snapshot(save(state)), decayed: loss };
    },

    /**
     * 按人口规模配置储量与容量（供播种期按居民数设定避难所储备）。
     * 原实现只有固定默认值（stockpile 100 / capacity 100），在 50 人时人均仅 2 单位，
     * 开局同步进食/饮水会在十余 tick 内抽干库存；而 effectFor 的守卫是
     * 「consume 成功才降需求」，库存为 0 时需求不再下降 → 需求涨到 1.0 触发死亡。
     * 只允许上调容量，不下调，避免误改既有默认语义。
     */
    configure({ stockpile, capacity } = {}) {
      const state = load();
      if (typeof capacity === 'number' && Number.isFinite(capacity) && capacity > state.capacity) {
        state.capacity = capacity;
      }
      if (typeof stockpile === 'number' && Number.isFinite(stockpile) && stockpile > state.stockpile) {
        state.stockpile = clamp(stockpile, 0, state.capacity);
      }
      return snapshot(save(state));
    },

    /** 复位到默认库存（测试用；只影响本资源节点）。 */
    __reset() {
      save(defaults());
    },
  };
}
