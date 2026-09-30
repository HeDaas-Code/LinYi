/**
 * 原子读写单文件运行快照。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** 读取快照；目标文件尚不存在时返回 null。 */
export async function readSnapshot(filePath) {
  const target = path.resolve(filePath);
  let text;
  try {
    text = await readFile(target, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw new Error('读取运行存档失败（' + target + '）：' + err.message);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('运行存档不是有效 JSON（' + target + '）：' + err.message);
  }
}

/** 写入临时文件后原子替换目标文件，避免进程中断留下半份 JSON。 */
export async function writeSnapshot(filePath, snapshot) {
  const target = path.resolve(filePath);
  const temporary = target + '.' + process.pid + '.' + randomUUID() + '.tmp';
  let text;
  try {
    text = JSON.stringify(snapshot);
  } catch (err) {
    throw new Error('运行存档无法序列化：' + err.message);
  }
  if (typeof text !== 'string') throw new TypeError('运行存档必须为 JSON 对象');

  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(temporary, text + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } catch (err) {
    await rm(temporary, { force: true }).catch(() => {});
    throw new Error('写入运行存档失败（' + target + '）：' + err.message);
  }
}
