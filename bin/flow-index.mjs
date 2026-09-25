#!/usr/bin/env node
/**
 * truman-town 数据流转索引生成器 / Data-Flow Index Generator
 *
 * 解决什么问题：沙盘里上百个模块级可变状态 + 42 个图节点类型 + worldState 键
 * 互相读写，靠人读代码已无法一眼看清「某个值从哪来、到哪去」。
 * 本工具从源码静态提取这些事实，产出 flow-index.json，用于：
 *   - 排查「非预期数据」的由来（某字段是谁写的）
 *   - 发现「写了没人读」的装饰性机制（实测踩过：隔离名单）
 *   - 发现「跨 run 泄漏」（有状态但未纳入 reset）
 *
 * 设计取舍：
 * - 只做静态提取，不做推断：每条事实都带 file:line，可人工复核。
 * - 索引是派生数据，不允许手写；配套测试比对再生成结果，防止腐烂。
 *
 *   node bin/flow-index.mjs [--json <path>]
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const NL = String.fromCharCode(10);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.js')) out.push(p);
  }
  return out;
}

/** 去掉注释（保持行号与列位置不变）。 */
function stripComments(src) {
  let out = '';
  let i = 0;
  let inBlock = false;
  let inLine = false;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inLine) {
      if (c === NL) { inLine = false; out += c; } else out += ' ';
      i += 1; continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; out += '  '; i += 2; continue; }
      out += c === NL ? NL : ' ';
      i += 1; continue;
    }
    if (quote !== null) {
      out += c;
      if (c === '\\') { out += src[i + 1] === undefined ? '' : src[i + 1]; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1; continue;
    }
    if (c === '/' && n === '/') { inLine = true; out += '  '; i += 2; continue; }
    if (c === '/' && n === '*') { inBlock = true; out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    out += c;
    i += 1;
  }
  return out;
}

/** 逐行括号净深度；模块级 = 0。 */
function depths(lines) {
  const out = [];
  let d = 0;
  for (const line of lines) {
    out.push(d);
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') d += 1;
      else if (ch === '}' || ch === ')' || ch === ']') d -= 1;
    }
  }
  return out;
}

const ID = '[A-Za-z0-9_$]';
const WS = '[ \\t]';
const MUTATING = ['push', 'pop', 'shift', 'unshift', 'splice', 'add', 'delete',
  'set', 'clear', 'sort', 'fill', 'reverse', 'copyWithin'];

/**
 * 标识符在行内的所有「非属性访问」出现位置。
 *
 * 注意要跳过 \u5c55\u5f00\u8fd0\u7b97\u7b26：...wildcard 里的 wildcard 是**读取**（迭代），
 * 但前一个字符是 '.'，会被 \u5c5e\u6027\u8bbf\u95ee\u89c4\u5219误杀——实测因此把 pubsub.wildcard
 * 误报为「只写不读」。故 '.' 且前一位也是 '.' 时视为读取。
 */
function identPositions(line, name) {
  const out = [];
  let i = line.indexOf(name);
  while (i !== -1) {
    const before = i === 0 ? '' : line[i - 1];
    const before2 = i < 2 ? '' : line[i - 2];
    const spread = before === '.' && before2 === '.';
    if (spread || !(before === '.' || /[A-Za-z0-9_$]/.test(before))) out.push(i);
    i = line.indexOf(name, i + 1);
  }
  return out;
}

/** 判定某标识符在该行是写还是读。 */
function usageOf(line, name) {
  const positions = identPositions(line, name);
  if (positions.length === 0) return null;
  for (const at of positions) {
    const rest = line.slice(at + name.length);
    let j = 0;
    while (j < rest.length && (rest[j] === ' ' || rest[j] === '\t')) j += 1;
    const tail = rest.slice(j);
    if (/^(\+\+|--)/.test(tail)) return 'write';
    if (/^[-+*/%]?=(?!=)/.test(tail)) return 'write';
    if (/^\[[^\]]*\][ \t]*=(?!=)/.test(tail)) return 'write';
    for (const m of MUTATING) {
      if (new RegExp('^[.]' + m + '[(]').test(tail)) return 'write';
    }
  }
  return 'read';
}

/** 模块级函数块（含 export function 与 const x = () => {}）。 */
function functionBlocks(lines, lineDepths) {
  const blocks = [];
  const fnRe = new RegExp('^(?:export' + WS + '+)?(?:async' + WS + '+)?function' + WS + '+(' + ID + '+)');
  const arrowRe = new RegExp('^(?:export' + WS + '+)?const' + WS + '+(' + ID + '+' + ')' + WS + '*=' + WS + '*(?:async' + WS + '*)?(?:[(][^)]*[)]|' + ID + '+)[ \\t]*=>[ \\t]*[{]');
  for (let i = 0; i < lines.length; i += 1) {
    if (lineDepths[i] !== 0) continue;
    const m = fnRe.exec(lines[i]);
    const arrow = arrowRe.exec(lines[i]);
    const name = m ? m[1] : (arrow ? arrow[1] : null);
    if (name === null) continue;
    let depth = 0;
    let started = false;
    let end = i;
    for (let j = i; j < lines.length; j += 1) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth += 1; started = true; }
        else if (ch === '}') depth -= 1;
      }
      if (started && depth <= 0) { end = j; break; }
    }
    blocks.push({ name, start: i, end, exported: lines[i].startsWith('export') });
    i = end;
  }
  return blocks;
}

function classifyContainer(init) {
  if (init === undefined) return 'scalar';
  const t = init.trim();
  if (t.startsWith('new Map(')) return 'map';
  if (t.startsWith('new Set(')) return 'set';
  if (t.startsWith('[]')) return 'array';
  if (t.startsWith('{}')) return 'object';
  if (t === 'true' || t === 'false') return 'flag';
  if (/^-?[0-9]/.test(t)) return 'number';
  if (t.startsWith("'") || t.startsWith('"')) return 'string';
  if (t === 'null') return 'null';
  return 'expr';
}

function scanFile(absPath) {
  const raw = readFileSync(absPath, 'utf8');
  const src = stripComments(raw);
  const lines = src.split(NL);
  const rawLines = raw.split(NL);
  const d = depths(lines);
  const blocks = functionBlocks(lines, d);
  const rel = relative(ROOT, absPath);
  const modulePath = rel.startsWith('src/') ? rel.slice(4) : rel;
  const moduleId = modulePath.replace(/[.]js$/, '').split('/').join('.');
  // 复位函数有命名变体：__reset / reset / __resetSeq / __resetAll 等。
  // 只认 __reset 会把 runtime.orchestrator.loop.reset、observer.recorder._shared.__resetSeq
  // 误报为「无复位函数」——实测如此。
  const resetBlocks = blocks.filter((b) => /^(__)?reset/i.test(b.name));

  const declRe = new RegExp('^(?:export' + WS + '+)?(let|var|const)' + WS + '+(' + ID + '+)[ \\t]*(?:=[ \\t]*(.*?))?;?[ \\t]*$');
  const typeRe = new RegExp("^(?:export" + WS + "+)?const" + WS + "+([A-Z_][A-Z0-9_]*)" + WS + "*=" + WS + "*'([^']+)'");

  const stores = [];
  const graphTypes = [];
  const worldKeys = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    for (const mm of lines[i].matchAll(/worldState[.](?:set|get)[(]'([^']+)'/g)) worldKeys.add(mm[1]);
    if (d[i] !== 0) continue;

    const tm = typeRe.exec(lines[i]);
    if (tm !== null && tm[1].endsWith('TYPE')) {
      graphTypes.push({ constName: tm[1], type: tm[2], file: rel, line: i + 1 });
    }

    const decl = declRe.exec(lines[i]);
    if (decl === null) continue;
    const kw = decl[1];
    const name = decl[2];
    const init = decl[3];
    const kind = classifyContainer(init);
    const isMutable = kw !== 'const' || ['map', 'set', 'array', 'object'].includes(kind);
    if (!isMutable) continue;

    const writers = [];
    const readers = [];
    for (const b of blocks) {
      let wrote = false;
      let read = false;
      for (let j = b.start; j <= b.end && j < lines.length; j += 1) {
        const u = usageOf(lines[j], name);
        if (u === 'write') wrote = true;
        else if (u === 'read') read = true;
      }
      if (wrote) writers.push(b.name);
      if (read) readers.push(b.name);
    }

    let resetCovered = false;
    for (const rb of resetBlocks) {
      let hit = false;
      for (let j = rb.start; j <= rb.end; j += 1) {
        if (usageOf(lines[j], name) === 'write') { hit = true; break; }
      }
      if (hit) { resetCovered = true; break; }
    }

    const exportedTouchers = blocks
      .filter((b) => b.exported && (writers.includes(b.name) || readers.includes(b.name)))
      .map((b) => b.name);
    const resetNames = resetBlocks.map((b) => b.name);
    const realWriters = writers.filter((w) => !resetNames.includes(w));
    const realReaders = readers.filter((r) => !resetNames.includes(r));

    stores.push({
      id: moduleId + '.' + name,
      module: moduleId,
      file: rel,
      line: i + 1,
      name,
      keyword: kw,
      kind,
      init: (init === undefined ? '' : init).slice(0, 60),
      resetCovered,
      resetDeclared: resetBlocks.length > 0,
      resetFunctions: resetBlocks.map((b) => b.name),
      writers: realWriters,
      readers: realReaders,
      writeCount: realWriters.length,
      readCount: realReaders.length,
      exportedTouchers,
      exported: lines[i].startsWith('export'),
      rawLine: (rawLines[i] === undefined ? '' : rawLines[i]).trim().slice(0, 110),
    });
  }

  return {
    file: rel, module: moduleId, stores, graphTypes,
    worldKeys: [...worldKeys],
    hasReset: resetBlocks.length > 0,
    resetFunctions: resetBlocks.map((b) => b.name),
  };
}

const files = walk(SRC).sort();
const scanned = files.map(scanFile);
const stores = scanned.flatMap((s) => s.stores);
const graphTypes = scanned.flatMap((s) => s.graphTypes);
const worldKeys = [...new Set(scanned.flatMap((s) => s.worldKeys))].sort();

const diagnostics = [];
for (const s of stores) {
  if (s.writeCount > 0 && s.readers.length === 0) {
    diagnostics.push({
      level: 'error', code: 'store/never-read', subject: s.id,
      message: '被 ' + s.writeCount + ' 处写入（' + s.writers.join(', ') + '）但无任何函数读取：状态不产生行为后果',
      at: s.file + ':' + s.line,
    });
  }
  if (!s.resetCovered && s.writeCount > 0) {
    diagnostics.push({
      level: s.resetDeclared ? 'warning' : 'error',
      code: s.resetDeclared ? 'store/reset-missing' : 'store/no-reset-function',
      subject: s.id,
      message: s.resetDeclared
        ? '文件有 __reset 但未覆盖该变量：跨 run 残留会使结果取决于此前跑过什么'
        : '文件无 __reset 且该变量被写入：状态无法复位',
      at: s.file + ':' + s.line,
    });
  }
  if (s.exportedTouchers.length === 0 && s.writeCount === 0 && s.readCount === 0) {
    diagnostics.push({ level: 'warning', code: 'store/dead', subject: s.id, message: '无任何函数读写', at: s.file + ':' + s.line });
  }
}



const byKind = {};
for (const s of stores) byKind[s.kind] = (byKind[s.kind] === undefined ? 0 : byKind[s.kind]) + 1;

// ---- 图节点类型的生产/消费方：回答「这个值是谁写的、谁读的」 ----
/**
 * 图节点类型的生产/消费方。
 *
 * 用**类型字符串**（如 'agent.health'）而非常量名 'TYPE' 来匹配：
 * 43 个类型里有大量同名 TYPE 常量，按常量名匹配会把不相干的文件全卷进来（实测如此）。
 * 字符串在整个仓库里唯一，是可靠的主键。
 *
 * 判定规则：
 * - 生产：该文件调用了 graph.write 且文中出现该类型字符串
 * - 消费：该文件出现该类型字符串且调用了 graph.read/query/list
 */
const typeLiteral = (t) => "'" + t + "'";
/**
 * 某文件的导入来源（模块说明符）。
 * 绝大多数消费者并不直接调 graph.read，而是 import 那个封装了读写的模块，
 * 例如 episodic.write/query。只看 graph.* 会把它们全判成孤立（实测 34/43 误报）。
 */
function importSpecifiers(src) {
  const out = [];
  for (const m of src.matchAll(/from[ \\t]*'([^']+)'/g)) out.push(m[1]);
  return out;
}

/**
 * 模块命名空间路径。多数消费者不按路径 import，而是走聚合导出，
 * 例如 agent.memory.episodic.store.write(...) 而非 from './episodic/store.js'。
 * 因此把「声明文件在 src 下的相对路径」同时转成聚合访问前缀：
 *   src/agent/memory/episodic/store.js → agent.memory.episodic.store
 * 其中每层前缀都算「可能被访问」的命名空间（agent.memory.episodic、agent.memory 也常被用）。
 */
function namespacePrefixes(relFile) {
  const noExt = relFile.replace(/^src\//, '').replace(/[.]js$/, '');
  const parts = noExt.split('/');
  const out = [];
  for (let i = parts.length; i >= 2; i -= 1) out.push(parts.slice(0, i).join('.'));
  return out;
}
/**
 * 同一类型字符串可能被多个模块各自声明（实测 town.building.structure 被
 * agent/crafting/construction.js 与 town/building/structure.js 各定义一次）。
 * 这是真实的契约重复，必须先按类型字符串去重再统计，否则会产出重复模块 id。
 */
const typeOwners = new Map();
for (const g of graphTypes) {
  if (!typeOwners.has(g.type)) typeOwners.set(g.type, []);
  typeOwners.get(g.type).push(g.file + ':' + g.line);
}
const declaredTypes = [...typeOwners.keys()].sort().map((type) => {
  const owners = typeOwners.get(type);
  const first = graphTypes.find((x) => x.type === type);
  return { type, constName: first.constName, declaredAt: first.file + ':' + first.line, declaredBy: owners };
});
const graphFlow = declaredTypes.map((g) => {
  const producers = [];
  const consumers = [];
  // declaredAt 形如 src/a/b.js:12；去重后不再有 g.file 字段，这里拆回路径。
  const ownerFile = g.declaredAt.split(':')[0];
  const ownerNoExt = ownerFile.replace(/[.]js$/, '');
  const nsPrefixes = namespacePrefixes(ownerFile);
  for (const abs of files) {
    const src = readFileSync(abs, 'utf8');
    const rel = relative(ROOT, abs);
    const declaresType = src.includes(typeLiteral(g.type));
    const writesDirect = /graph[.]write[(]/.test(src);
    const readsDirect = /graph[.](read|query|list)[(]/.test(src);
    // 间接消费：import 了持有该类型的模块（同目录同级 / index 再导出）
    const parentDir = ownerNoExt.split('/').slice(0, -1).join('/');
    const byPath = importSpecifiers(src).some((spec) => {
      if (!spec.startsWith('.')) return false;
      const norm = new URL(spec, 'file:///' + rel).pathname.replace(/^\//, '');
      return norm === ownerNoExt || norm === parentDir;
    });
    // 聚合命名空间访问（最主流的消费方式，实测此前全漏）
    const byNamespace = nsPrefixes.some((p) => new RegExp('(^|[^\\w$.])' + p.replace(/[.]/g, '[.]') + '[.]').test(src));
    const indirect = byPath || byNamespace;
    // 注意：**声明者自己调用 graph.read({type}) 是货真价实的消费者**
    // （实测 config.js 在 L498 自读，却因「同文件既写又读」被排除而误报孤立）。
    // 生产者与消费者不是互斥关系：一个模块完全可以既写又读同一类型。
    if (writesDirect && (declaresType || rel === ownerFile)) producers.push(rel);
    if (readsDirect && declaresType) consumers.push(rel);
    else if (indirect && rel !== ownerFile) consumers.push(rel);
  }
  if (!producers.includes(ownerFile)) producers.push(ownerFile);
  const producersU = [...new Set(producers)];
  // 不再从消费者中剔除生产者：既写又读是常态，剔除会制造假孤立。
  const consumersU = [...new Set(consumers)];
  return {
    type: g.type,
    constName: g.constName,
    declaredAt: g.file + ':' + g.line,
    producers: producersU,
    consumers: consumersU,
    orphan: producersU.length <= 1 && consumersU.length === 0,
    duplicateDeclaration: g.declaredBy.length > 1,
    declaredBy: g.declaredBy,
  };
});

// 重复声明的图类型：同一条契约散落在多个文件里，改一处最容易漏另一处。
for (const g of graphFlow) {
  if (g.duplicateDeclaration) {
    diagnostics.push({
      level: 'warning', code: 'graph/duplicate-declaration', subject: g.type,
      message: '同一图类型被多处各自声明（' + g.declaredBy.join(', ') + '）：契约重复，改一处易漏另一处',
      at: g.declaredBy[0],
    });
  }
}

/**
 * 机制链：主循环 step() 的阶段顺序。
 * 这张表**必须人工维护**——静态分析无法可靠推断「阶段之间的因果顺序」，
 * 而顺序恰恰是排查「为什么这个值在那一刻是那样」的关键。
 * 每条都标注了它所读写的状态单元，可与 stores 交叉检索。
 */
const STEP_PHASES = [
  { order: 0, name: '采集池再生', fn: 'regenForagePool', writes: ['runtime.orchestrator.loop.foragePool'], reads: ['runtime.orchestrator.loop._alivePopValue'], note: '每 tick 补池，容量按存活人口缩放；人口缓存须先失效' },
  { order: 1, name: '生存推进', fn: 'runSurvival', writes: ['survival.resources.food.stockpile', 'survival.resources.water.stockpile', 'survival.needs.meter'], reads: [], note: '资源衰减 / 需求增长 / 突发事件；返回事件感知' },
  { order: 2, name: '感知分发', fn: 'perception.collect + perception.route', writes: ['runtime.orchestrator.perception.inbox'], reads: [], note: '事件转 percept 并路由给各居民' },
  { order: 2.5, name: 'LAYA 紧迫度预取', fn: 'prefetchLayaUrgency', writes: ['runtime.orchestrator.loop.layaUrgencyCache'], reads: [], note: '可选通路，默认关闭；服务不可用静默回退。缓存每 tick clear' },
  { order: 3, name: '逐居民决策', fn: 'decide', writes: ['observer.recorder.decisionLog', 'agent.memory.semantic'], reads: ['runtime.orchestrator._stage2._candidateStateCache', 'agent.traits.tagset.store'], note: '候选生成 → 评分 → softmax；可被模型/日程覆盖' },
  { order: 3.5, name: '模型决策覆盖', fn: 'decideByModel', writes: [], reads: [], note: '仅 llmDecideEnabled 时；模型从**已可行候选集**内选，不新增行动' },
  { order: 3.6, name: '日程覆盖', fn: 'scheduleOverride', writes: ['agent.schedule.planner'], reads: [], note: '非紧急时以日程为准，紧急触发重排并写 agent.schedule.replan 事件' },
  { order: 4, name: '行动落库', fn: 'performAgentAction + dispatch.actions', writes: ['observer.recorder.actionLog', 'agent.memory.episodic.store', 'runtime.world-state'], reads: ['runtime.orchestrator.dispatch.lastApplied'], note: '非生存行动由居民自己发起（调用真实模块）；生存行动走 effectFor' },
  { order: 4.5, name: '死亡判定', fn: 'mortality', writes: ['runtime.orchestrator.loop.mortality'], reads: ['survival.needs.meter'], note: '饥饿/口渴持续 → 健康下降 → 移出 registry' },
  { order: 4.6, name: '公共角色影响', fn: 'society', writes: ['agent.role.society'], reads: [], note: '医生治疗等；society.activeEffects 决定识字与安全' },
  { order: 5, name: '阶段二（经济/社会）', fn: 'stage2.tick', writes: ['economy.*', 'social.*'], reads: ['agent.inventory.backpack'], note: '平台/声誉/企业/贸易/家庭' },
  { order: 6, name: '阶段三（文明）', fn: 'stage3.tick', writes: ['civilization.*'], reads: ['runtime.orchestrator.loop.foragePool'], note: '崩溃检测 → 遗产 → 重启；科技研究' },
];

/**
 * 关键状态机。每个都是「一组状态 + 迁移条件」，排查异常时先看它当前处于哪个状态。
 */
const STATE_MACHINES = [
  {
    id: 'agent.lifecycle', states: ['未出生', '存活', '死亡'],
    transitions: [
      { from: '未出生', to: '存活', trigger: 'agent.lifecycle.birth({tick, age})', at: 'src/agent/lifecycle.js:49' },
      { from: '存活', to: '存活(阶段变化)', trigger: 'agent.lifecycle.age() → stageOf(age) 未成年/成年/老年', at: 'src/agent/lifecycle.js:33' },
      { from: '存活', to: '死亡', trigger: 'age 超过老年死亡率 或 needs 顶格持续（starvation/dehydration）', at: 'src/agent/lifecycle.js:98' },
    ],
    persistedIn: ['runtime.registry', 'runtime.world-state'],
  },
  {
    id: 'survival.health.disease', states: ['未感染', '感染中(severity 0..1)', '康复'],
    transitions: [
      { from: '未感染', to: '感染中', trigger: 'disease.infect({diseaseId, severity})', at: 'src/survival/health/disease.js:85' },
      { from: '感染中', to: '感染中', trigger: 'symptom() 推进严重度', at: 'src/survival/health/disease.js:114' },
      { from: '感染中', to: '康复', trigger: 'disease.recover()（医疗物资 + 免疫加成）', at: 'src/survival/health/disease.js:136' },
    ],
    persistedIn: ['survival.health.disease'],
  },
  {
    id: 'survival.health.epidemic(隔离)', states: ['自由', '隔离中'],
    transitions: [
      { from: '自由', to: '隔离中', trigger: 'epidemic.quarantine()（疫情达阈值时对感染者）', at: 'src/survival/health/epidemic.js:70' },
      { from: '隔离中', to: '自由', trigger: 'epidemic.release()（已康复）', at: 'src/survival/health/epidemic.js:110' },
    ],
    persistedIn: ['survival.health.epidemic.quarantined'],
    consumedBy: ['runtime.orchestrator._stage2.expeditionConditionsFor（被隔离者不得外出）'],
    note: '曾长期是「只写不读」的装饰机制，且不幂等、只增不减；e63b932 修复',
  },
  {
    id: 'industry.business', states: ['active', 'insolvent', 'closed'],
    transitions: [
      { from: '不存在', to: 'active', trigger: 'bootstrapBusinesses（**固定路径，非涌现**）', at: 'src/runtime/orchestrator/_stage2.js' },
      { from: 'active', to: 'insolvent', trigger: 'business.insolvent（余额不足）', at: 'src/economy/industry/business.js:124' },
      { from: 'active', to: 'closed', trigger: 'business.closed', at: 'src/economy/industry/business.js:151' },
    ],
    persistedIn: ['economy.industry.business'],
    note: '已知缺口：创办走固定路径，三家种子 businesses 恒为 2。需实现居民驱动的 found/invest',
  },
  {
    id: 'civilization.lifecycle', states: ['存续', '疑似崩溃', '已确认', '已重启'],
    transitions: [
      { from: '存续', to: '疑似崩溃', trigger: 'collapse.detector.detect() 任一路径触发', at: 'src/civilization/collapse/detector.js:44' },
      { from: '疑似崩溃', to: '已确认', trigger: 'collapse.confirmer.confirm()', at: 'src/civilization/collapse/confirmer.js' },
      { from: '已确认', to: '已重启', trigger: 'restart.execute() 注入遗产并开新一代', at: 'src/civilization/restart.js:59' },
    ],
    persistedIn: ['civilization.legacy.graph', 'civilization.restart.HERITAGE_TYPE'],
    note: 'resource_exhausted 需**持续** collapsedScarceTicks 才计入；单 tick 见底是水位振荡的正常谷底（e63b932 修复）',
  },
  {
    id: 'agent.schedule', states: ['初始日程', '已重排'],
    transitions: [
      { from: '无', to: '初始日程', trigger: 'planner.generate({length, occupation, needs})', at: 'src/agent/schedule/planner.js' },
      { from: '初始日程', to: '已重排', trigger: 'planner.replan()（紧急需求 / 跨日）', at: 'src/agent/schedule/planner.js' },
    ],
    persistedIn: ['agent.schedule.planner'],
    note: '日程只作非危机时的默认倾向；居民保有自决权，可自主选择日程外行动',
  },
];

const index = {
  schemaVersion: 1,
  generatedFrom: 'bin/flow-index.mjs',
  stats: {
    files: files.length,
    modules: scanned.filter((s) => s.stores.length > 0).length,
    stores: stores.length,
    graphTypes: graphTypes.length,
    worldKeys: worldKeys.length,
    filesWithReset: scanned.filter((s) => s.hasReset).length,
    byKind,
    diagnostics: {
      error: diagnostics.filter((x) => x.level === 'error').length,
      warning: diagnostics.filter((x) => x.level === 'warning').length,
    },
  },
  stores,
  graphTypes,
  graphFlow,
  worldKeys,
  stepPhases: STEP_PHASES,
  stateMachines: STATE_MACHINES,
  diagnostics,
};

const jsonArg = process.argv.indexOf('--json');
const jsonPath = jsonArg === -1 ? join(ROOT, 'flow-index.json') : process.argv[jsonArg + 1];
writeFileSync(jsonPath, JSON.stringify(index, null, 2) + NL, 'utf8');

// ---- 查询模式：排查「这个值为什么变成这样」 ----
const qArg = process.argv.indexOf('--query');
if (qArg !== -1) {
  const q = (process.argv[qArg + 1] === undefined ? '' : process.argv[qArg + 1]).toLowerCase();
  const hitStores = stores.filter((s) => (s.id + ' ' + s.name + ' ' + s.file).toLowerCase().includes(q));
  const hitTypes = graphFlow.filter((g) => g.type.toLowerCase().includes(q));
  console.log('=== 查询 "' + q + '" ===');
  console.log('');
  for (const s of hitStores) {
    console.log('[状态] ' + s.id + '   (' + s.kind + ', ' + s.file + ':' + s.line + ')');
    console.log('   ' + s.rawLine);
    console.log('   写入方: ' + (s.writers.length === 0 ? '(无)' : s.writers.join(', ')));
    console.log('   读取方: ' + (s.readers.length === 0 ? '(无 ⚠ 装饰性状态)' : s.readers.join(', ')));
    console.log('   纳入复位: ' + (s.resetCovered ? '是' : '否 ⚠'));
    console.log('');
  }
  for (const g of hitTypes) {
    console.log('[图类型] ' + g.type + '   @' + g.declaredAt);
    console.log('   生产: ' + (g.producers.join(', ') || '(无)'));
    console.log('   消费: ' + (g.consumers.join(', ') || '(无 ⚠ 孤立)'));
    console.log('');
  }
  const hitPhases = STEP_PHASES.filter((p) => (p.name + ' ' + p.fn + ' ' + (p.writes || []).join(' ')).toLowerCase().includes(q));
  for (const p of hitPhases) {
    console.log('[阶段 ' + p.order + '] ' + p.name + ' — ' + p.fn);
    console.log('   ' + p.note);
    console.log('');
  }
  const hitSm = STATE_MACHINES.filter((m) => (m.id + ' ' + m.states.join(' ')).toLowerCase().includes(q));
  for (const m of hitSm) {
    console.log('[状态机] ' + m.id + '  状态: ' + m.states.join(' → '));
    for (const t of m.transitions) console.log('   ' + t.from + ' → ' + t.to + '  因: ' + t.trigger + '  @' + t.at);
    if (m.consumedBy !== undefined) console.log('   消费点: ' + m.consumedBy.join(', '));
    if (m.note !== undefined) console.log('   注意: ' + m.note);
    console.log('');
  }
  if (hitStores.length + hitTypes.length + hitPhases.length + hitSm.length === 0) {
    console.log('（无匹配）');
  }
  process.exit(0);
}

console.log('=== 数据流转索引 ===');
console.log('文件 ' + index.stats.files + ' / 含状态模块 ' + index.stats.modules
  + ' / 状态单元 ' + index.stats.stores + ' / 图节点类型 ' + index.stats.graphTypes
  + ' / worldState 键 ' + index.stats.worldKeys);
console.log('状态类型分布: ' + JSON.stringify(byKind));
console.log('诊断: error ' + index.stats.diagnostics.error + ' / warning ' + index.stats.diagnostics.warning);
console.log('');
console.log('--- error 级 ---');
for (const x of diagnostics.filter((y) => y.level === 'error').slice(0, 24)) {
  console.log('  [' + x.code + '] ' + x.subject);
  console.log('      ' + x.message + '   @' + x.at);
}
console.log('');
console.log('--- warning 级（前 14）---');
for (const x of diagnostics.filter((y) => y.level === 'warning').slice(0, 14)) {
  console.log('  [' + x.code + '] ' + x.subject + ' — ' + x.message);
}
console.log('');
console.log('索引已写入 ' + jsonPath);
