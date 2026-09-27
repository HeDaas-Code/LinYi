/**
 * truman-town.survival.environment.radiation — 辐射区。
 *
 * 地表不是均质的：不同地块的辐射强度不同，且会随时间缓慢扩散。
 * 探索者进入高辐射地块会累积剂量，剂量决定健康损失。
 *
 * 设计取舍：
 * - **网格而非连续场**：核冬天后的地表只需粗粒度网格（默认 8×8），
 *   每格一个强度值。这既够表达「镇北边那片不能去」，又无需任何空间索引。
 * - **扩散是局部平滑，不是物理模拟**：每轮扩散把每格向邻居均值靠拢一部分
 *   （热方程的一次显式欧拉步），保持总量近似守恒。这给出「污染会蔓延到
 *   相邻区域」的直觉，且完全确定。
 * - **避难所是豁免区**：避难所所在格强度强制为 0，且向内扩散会被衰减，
 *   否则「躲进避难所」在数值上没有意义。
 */

import * as rng from '../../infra/rng.js';

const DEFAULT_SIZE = 8;
const DEFAULT_DIFFUSION = 0.12;
const DEFAULT_DECAY = 0.02;
const SHELTER_CELL = Object.freeze({ x: 0, y: 0 });
/** 避难所对向内扩散的衰减：相邻格扩散进来的量乘以该系数。 */
const SHELTER_ATTENUATION = 0.15;

let size = DEFAULT_SIZE;
let grid = [];
let initialized = false;

function idx(x, y) { return y * size + x; }

function inBounds(x, y) { return x >= 0 && y >= 0 && x < size && y < size; }

/**
 * 生成初始辐射场。
 * 采用「若干热点的径向衰减叠加」，热点位置与强度由 rng 决定。
 * 这样地表有结构（靠近热点危险，远处安全），而不是均匀噪声。
 */
function generate(hotspotCount = 3) {
  grid = new Array(size * size).fill(0);
  const spots = [];
  for (let i = 0; i < hotspotCount; i += 1) {
    const x = rng.int(0, size - 1);
    const y = rng.int(0, size - 1);
    if (x === SHELTER_CELL.x && y === SHELTER_CELL.y) continue;
    const peak = 0.55 + rng.next() * 0.45;
    // 热点半径必须显著小于网格尺度：原 1.5~4.0 在 8×8 上互相重叠，
    // 导致**全域沦陷**（实测 40+ 格强度 >0.9，连"近郊"都不可行），
    // 与"避难所周边尚可活动、越远越危险"的设定相反。
    // 现在半径上界取网格的 1/3，使热点彼此分离、存在安全走廊。
    const radius = 0.8 + rng.next() * Math.max(0.5, size / 3 - 0.8);
    spots.push({ x, y, peak, radius });
  }
  // 距离衰减：离避难所越远辐射越高。没有这一项，热点落在哪里纯属偶然，
  // "走得越远越危险"这一探索权衡就无法成立。
  const maxDist = Math.hypot(size - 1, size - 1);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let v = 0;
      for (const s of spots) {
        const d = Math.hypot(x - s.x, y - s.y);
        v += s.peak * Math.exp(-(d * d) / (2 * s.radius * s.radius));
      }
      const dist = Math.hypot(x - SHELTER_CELL.x, y - SHELTER_CELL.y);
      const distanceFloor = 0.75 * (dist / maxDist) ** 1.4;
      grid[idx(x, y)] = Math.min(1, Math.max(0, Math.max(v, distanceFloor)));
    }
  }
  grid[idx(SHELTER_CELL.x, SHELTER_CELL.y)] = 0;
  return spots.length;
}

function ensure() {
  if (!initialized) {
    generate();
    initialized = true;
  }
}

export function __reset(input = {}) {
  size = Number.isInteger(input.size) && input.size >= 2 ? input.size : DEFAULT_SIZE;
  grid = [];
  initialized = false;
}

// ---- 持久化：辐射场必须进存档 ----

/**
 * 导出辐射网格。
 *
 * 辐射场是**空间累积状态**（热点扩散 + 衰减 + 避难所豁免），且会被探索
 * 结算读取。不入档则恢复后场被重掷（initialized=false），居民脚下的辐射
 * 剂量与连续运行不同，健康与探索结果随之分叉。
 */
export function __snapshot() {
  return { size, grid: [...grid], initialized };
}

/**
 * 恢复辐射网格。
 * @param {{size?: number, grid?: number[], initialized?: boolean}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('radiation.__restore: 状态必须为对象');
  }
  if (Number.isInteger(data.size) && data.size >= 2) size = data.size;
  grid = Array.isArray(data.grid) ? data.grid.map((v) => (Number.isFinite(v) ? v : 0)) : [];
  initialized = data.initialized === true;
  return { size, cells: grid.length, initialized };
}

/** 配置网格尺寸并重生。尺寸变更后全部强度重掷（旧场已无意义）。 */
export function configure(input = {}) {
  if (Number.isInteger(input.size) && input.size >= 2) {
    size = input.size;
    initialized = false;
  }
  ensure();
  return { size, hotspots: grid.filter((v) => v > 0.3).length };
}

/**
 * 查询某格的辐射强度。
 * @param {{ x?: number, y?: number, safe?: boolean }} [input]
 *   safe=true 表示探索者处于避难所内（强度恒为 0，无论坐标）。
 */
export function query(input = {}) {
  ensure();
  if (input.safe === true) return { x: SHELTER_CELL.x, y: SHELTER_CELL.y, intensity: 0, safe: true };
  const x = Number.isInteger(input.x) ? input.x : SHELTER_CELL.x;
  const y = Number.isInteger(input.y) ? input.y : SHELTER_CELL.y;
  if (!inBounds(x, y)) return { x, y, intensity: 1, safe: false, outOfBounds: true };
  return { x, y, intensity: grid[idx(x, y)], safe: false, outOfBounds: false };
}

/**
 * 扩散一步：局部平滑 + 自然衰减，避难所格强制为 0。
 * @param {{ diffusion?: number, decay?: number, steps?: number }} [input]
 */
export function spread(input = {}) {
  ensure();
  const diffusion = typeof input.diffusion === 'number' && input.diffusion >= 0 && input.diffusion <= 0.25
    ? input.diffusion : DEFAULT_DIFFUSION;
  const decay = typeof input.decay === 'number' && input.decay >= 0 && input.decay < 1
    ? input.decay : DEFAULT_DECAY;
  const steps = Number.isInteger(input.steps) && input.steps > 0 ? input.steps : 1;
  const before = grid.reduce((a, b) => a + b, 0);
  for (let s = 0; s < steps; s += 1) {
    const next = grid.slice();
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0; let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (!inBounds(nx, ny)) continue;
          sum += grid[idx(nx, ny)]; n += 1;
        }
        const avg = n > 0 ? sum / n : grid[idx(x, y)];
        let v = grid[idx(x, y)] + diffusion * (avg - grid[idx(x, y)]);
        // 避难所对**向内**扩散有额外衰减——否则躲进避难所毫无意义。
        if (x === SHELTER_CELL.x && y === SHELTER_CELL.y) v *= SHELTER_ATTENUATION;
        next[idx(x, y)] = Math.min(1, Math.max(0, v * (1 - decay)));
      }
    }
    grid = next;
    grid[idx(SHELTER_CELL.x, SHELTER_CELL.y)] = 0;
  }
  const after = grid.reduce((a, b) => a + b, 0);
  return { steps, totalBefore: before, totalAfter: after, size };
}

/** 把网格作为二维数组返回（供可视化与测试）。 */
export function field() {
  ensure();
  const out = [];
  for (let y = 0; y < size; y += 1) {
    const row = [];
    for (let x = 0; x < size; x += 1) row.push(grid[idx(x, y)]);
    out.push(row);
  }
  return out;
}

/** 剂量累积：强度 × 暴露时长 × 防护系数。 */
export function dose(input = {}) {
  const q = query(input);
  const hours = typeof input.hours === 'number' && input.hours > 0 ? input.hours : 1;
  const protection = typeof input.protection === 'number' && input.protection >= 0 && input.protection <= 1
    ? input.protection : 0;
  return { intensity: q.intensity, hours, protection, dose: q.intensity * hours * (1 - protection) };
}
