/**
 * 内部确定性哈希（不作为 Normify 模块暴露）。
 *
 * 为回放 run id 与反事实投影提供稳定、可复现的 8 位 hex 摘要，
 * 使"按种子回放"与"反事实分支"在相同输入下产出相同结果。
 */

/** FNV-1a 风格 32 位哈希，返回 8 位小写 hex 字符串。 */
export function hashHex(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
