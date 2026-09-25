#!/usr/bin/env node
/**
 * 从 flow-index.json 生成 Normify 结构树 / Flow Index → Normify Tree
 *
 * 为什么需要它：flow-index.json 是机读的（153 个状态单元 + 43 个图类型），
 * 但排查异常时人需要在**图上下钻**——「这个值属于哪个模块、谁在写、谁在读、
 * 它在主循环的哪一阶段被改」。本工具把它转成与 truman-town 同构的 Normify 树，
 * 可用 normify_render 出交互式 HTML。
 *
 * 设计取舍：
 * - **独立树**而不是塞进 truman-town：truman-town 描述「代码该长什么样」（契约），
 *   本树描述「数据实际怎么流」（事实）。两者会独立演进，混在一起会互相污染。
 * - **确定性**：同一份 flow-index.json 必产出同一棵树（排序 + 无时间戳），
 *   便于 diff 与测试比对。
 * - 每个叶子模块的 apis 就是「写入口/读入口」，deps 就是真实的读写箭头——
 *   于是「某状态没人读」在图上直接表现为**零入边**，一眼可见。
 *
 *   node bin/flow-to-normify.mjs [--dir normify-truman-town-flow]
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerTools } from '/home/agentuser/.dsh/profiles/web/node_modules/@dsh-external/dsh-normify/lib/tools.js';

const ROOT = process.cwd();
const DIR = (() => {
  const i = process.argv.indexOf('--dir');
  return i === -1 ? 'normify-truman-town-flow' : process.argv[i + 1];
})();

const idx = JSON.parse(readFileSync(join(ROOT, 'flow-index.json'), 'utf8'));
const map = new Map();
registerTools({ tools: { register(def) { map.set(def.name, def); } } }, { rootDir: ROOT });
const call = (name, args) => map.get(name).execute({ project: 'truman-town-flow', dir: join(ROOT, DIR), ...args });

/** id 段只允许 [a-z0-9][a-z0-9-]*：驼峰/下划线/大写一律规范化。 */
function seg(s) {
  const t = String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const u = t.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return u === '' ? 'x' : u;
}
/** 稳定 uid：由 id 派生，保证同输入同输出。 */
function uid8(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

const b = (zh, en) => ({ zh, en });
const NOW = idx.generatedFrom === undefined ? '2026-01-01T00:00:00Z' : '2026-01-01T00:00:00Z';

if (existsSync(join(ROOT, DIR))) rmSync(join(ROOT, DIR), { recursive: true, force: true });
await call('normify_project_init', {
  root: {
    id: 'truman-town-flow',
    name: b('楚门小镇数据流转索引', 'Truman Town Data-Flow Index'),
    description: b(
      '从源码静态提取的**数据流转事实**：状态单元（谁写谁读）、图节点类型（生产者/消费者）、主循环阶段、关键状态机。用于排查「某个值为什么变成这样」与「某机制是否只是装饰」。',
      'Data-flow facts statically extracted from source: state units (who writes/reads), graph node types (producers/consumers), main-loop phases, and key state machines.',
    ),
    repository: 'https://example.invalid/LinYi',
  },
});

const modules = [];
// 根
modules.push({ id: 'truman-town-flow', parent: null, name: b('楚门小镇数据流转索引', 'Truman Town Data-Flow Index'), desc: b('数据流转总索引 / Complete data-flow index', 'Complete data-flow index'), apis: [], deps: [] });

// 1) 状态单元，按顶层目录分组
const byArea = new Map();
for (const s of idx.stores) {
  const area = s.module.split('.')[0];
  if (!byArea.has(area)) byArea.set(area, []);
  byArea.get(area).push(s);
}
const AREA_ZH = {
  agent: '智能体', social: '社会', survival: '生存', economy: '经济', civilization: '文明',
  runtime: '运行时', infra: '基础设施', observer: '观察者', town: '城镇', ai: '智能', api: '接口', genesis: '创世',
};
modules.push({ id: 'truman-town-flow.state', parent: 'truman-town-flow', name: b('状态单元', 'State Units'), desc: b('模块级可变状态：每个变量谁写、谁读、是否纳入复位', 'Module-level mutable state: writers, readers, reset coverage'), apis: [], deps: [] });
modules.push({ id: 'truman-town-flow.state.area', parent: 'truman-town-flow.state', name: b('按领域', 'By Area'), desc: b('按顶层目录归组', 'Grouped by top-level directory'), apis: [], deps: [] });

for (const [area, list] of [...byArea.entries()].sort((a, c) => a[0].localeCompare(c[0]))) {
  const areaId = 'truman-town-flow.state.area.' + seg(area);
  const noRead = list.filter((s) => s.writers.length > 0 && s.readers.length === 0).length;
  const noReset = list.filter((s) => !s.resetCovered && s.writers.length > 0).length;
  modules.push({
    id: areaId, parent: 'truman-town-flow.state.area',
    name: b((AREA_ZH[area] === undefined ? area : AREA_ZH[area]) + '（' + list.length + ' 个）', area + ' (' + list.length + ')'),
    desc: b(
      list.length + ' 个状态单元；' + noRead + ' 个只写不读；' + noReset + ' 个未纳入复位。',
      list.length + ' state units; ' + noRead + ' never read; ' + noReset + ' not covered by reset.',
    ),
    apis: [], deps: [],
  });
  for (const s of list.slice().sort((a, c) => a.id.localeCompare(c.id))) {
    const sid = areaId + '.' + seg(s.name) + '-' + uid8(s.id);
    modules.push({
      id: sid, parent: areaId,
      name: b(s.name, s.name),
      desc: b(
        s.kind + ' 类型，声明于 ' + s.file + ':' + s.line + '。'
        + '写入方 ' + s.writers.length + ' 个、读取方 ' + s.readers.length + ' 个；'
        + (s.resetCovered ? '已纳入复位。' : '**未纳入复位**（跨 run 可能残留）。'),
        s.kind + ' declared at ' + s.file + ':' + s.line + '; writers=' + s.writers.length + ', readers=' + s.readers.length,
      ),
      apis: [
        ...s.writers.slice(0, 8).map((w) => ({ protocol: 'rpc', path: 'write.' + w, description: b('写入方 ' + w, 'writer ' + w) })),
        ...s.readers.slice(0, 8).map((r) => ({ protocol: 'rpc', path: 'read.' + r, description: b('读取方 ' + r, 'reader ' + r) })),
      ],
      deps: [],
    });
  }
}

// 2) 图节点类型
modules.push({ id: 'truman-town-flow.graph', parent: 'truman-town-flow', name: b('图节点类型', 'Graph Node Types'), desc: b('图存储中的 43 种节点：生产者写入、消费者读取；零消费者的类型是可疑的', 'Graph node types: producers and consumers; zero-consumer types are suspect'), apis: [], deps: [] });
modules.push({ id: 'truman-town-flow.graph.types', parent: 'truman-town-flow.graph', name: b('全部类型', 'All Types'), desc: b('按类型字符串排序', 'Sorted by type string'), apis: [], deps: [] });
for (const g of idx.graphFlow.slice().sort((a, c) => a.type.localeCompare(c.type))) {
  const gid = 'truman-town-flow.graph.types.' + seg(g.type) + '-' + uid8(g.type);
  modules.push({
    id: gid, parent: 'truman-town-flow.graph.types',
    name: b(g.type + (g.orphan ? '（孤立）' : ''), g.type),
    desc: b(
      '声明于 ' + g.declaredAt + '。生产者 ' + g.producers.length + ' 个，消费者 ' + g.consumers.length + ' 个。'
      + (g.orphan ? '**无消费者——该类型被写入但无人读取，不产生行为后果。**' : ''),
      'Declared at ' + g.declaredAt + '; producers=' + g.producers.length + ', consumers=' + g.consumers.length,
    ),
    apis: [
      ...g.producers.slice(0, 6).map((p) => ({ protocol: 'rpc', path: 'write.' + p.replace(/[^A-Za-z0-9]/g, '_'), description: b('生产者 ' + p, 'producer ' + p) })),
      ...g.consumers.slice(0, 6).map((c) => ({ protocol: 'rpc', path: 'read.' + c.replace(/[^A-Za-z0-9]/g, '_'), description: b('消费者 ' + c, 'consumer ' + c) })),
    ],
    deps: [],
  });
}

// 3) 主循环阶段（容器 + 每阶段一个叶子）
modules.push({ id: 'truman-town-flow.phases', parent: 'truman-town-flow', name: b('主循环阶段', 'Main-Loop Phases'), desc: b('每 tick 的执行顺序：改动发生的时间线，排查「那一刻为什么是那个值」的入口', 'Per-tick execution order: the timeline of when each value changes'), apis: [], deps: [] });
modules.push({ id: 'truman-town-flow.phases.order', parent: 'truman-town-flow.phases', name: b('阶段顺序', 'Phase Order'), desc: b('按 order 升序', 'Ascending order'), apis: [], deps: [] });
for (const p of idx.stepPhases) {
  const pid = 'truman-town-flow.phases.order.p' + String(p.order).replace('.', '-');
  modules.push({
    id: pid, parent: 'truman-town-flow.phases.order',
    name: b('阶段 ' + p.order + '：' + p.name, 'Phase ' + p.order + ': ' + p.name),
    desc: b(p.note + '（入口 ' + p.fn + '）', p.note + ' (entry: ' + p.fn + ')'),
    apis: [{ protocol: 'rpc', path: p.fn, description: b('阶段入口', 'phase entry') }],
    deps: [],
  });
}

// 4) 状态机
modules.push({ id: 'truman-town-flow.machines', parent: 'truman-town-flow', name: b('关键状态机', 'State Machines'), desc: b('状态与迁移条件；排查异常时先确定当前处于哪个状态', 'States and transition triggers'), apis: [], deps: [] });
modules.push({ id: 'truman-town-flow.machines.list', parent: 'truman-town-flow.machines', name: b('全部状态机', 'All Machines'), desc: b('按 id 排序', 'Sorted by id'), apis: [], deps: [] });
for (const m of idx.stateMachines.slice().sort((a, c) => a.id.localeCompare(c.id))) {
  const mid = 'truman-town-flow.machines.list.' + seg(m.id) + '-' + uid8(m.id);
  modules.push({
    id: mid, parent: 'truman-town-flow.machines.list',
    name: b(m.id + '（' + m.states.join(' → ') + '）', m.id),
    desc: b(
      m.transitions.map((t) => t.from + '→' + t.to + '：' + t.trigger).join('；')
      + (m.note === undefined ? '' : '。注意：' + m.note),
      m.id + ' state machine with ' + m.transitions.length + ' transitions',
    ),
    apis: m.transitions.slice(0, 8).map((t, i) => ({
      protocol: 'rpc', path: 't' + i + '_' + t.from + '_to_' + t.to,
      description: b(t.trigger + ' @' + t.at, t.trigger),
    })),
    deps: [],
  });
}

// 5) 诊断
modules.push({ id: 'truman-town-flow.diagnostics', parent: 'truman-town-flow', name: b('诊断', 'Diagnostics'), desc: b('静态分析发现的疑似缺陷：只写不读、未纳入复位、孤立图类型', 'Static findings: never-read, reset-missing, orphan types'), apis: [], deps: [] });
const byCode = new Map();
for (const d of idx.diagnostics) {
  if (!byCode.has(d.code)) byCode.set(d.code, []);
  byCode.get(d.code).push(d);
}
for (const [code, list] of [...byCode.entries()].sort((a, c) => a[0].localeCompare(c[0]))) {
  const did = 'truman-town-flow.diagnostics.' + seg(code) + '-' + uid8(code);
  modules.push({
    id: did, parent: 'truman-town-flow.diagnostics',
    name: b(code + '（' + list.length + '）', code + ' (' + list.length + ')'),
    desc: b(
      list.slice(0, 6).map((x) => x.subject + ' @' + x.at).join('；'),
      code + ' findings: ' + list.length,
    ),
    apis: list.slice(0, 10).map((x, i) => ({
      protocol: 'rpc', path: x.code + '.' + i,
      description: b(x.subject + ' — ' + x.message, x.subject),
    })),
    deps: [],
  });
}

// 写入（分批，避免单次过大）
/** 双语字段截断：Normify 要求 description 不超过 500 字符，按两种语言分别裁。 */
const clamp = (v) => ({
  zh: String(v.zh).slice(0, 490),
  en: String(v.en).slice(0, 490),
});
/**
 * 容器模块（有子模块，含根）禁止 apis——Normify 规定 API 只定义在叶子上。
 * 因此先算出哪些 id 是父节点，再决定是否下发 apis。
 */
const parentIds = new Set(modules.filter((m) => m.parent !== null).map((m) => m.parent));

/**
 * API 键（protocol:path）在全项目内必须唯一，而「读取方函数名」会在多个模块里重复出现
 * （同一个 loop.js 读很多状态）。把模块 id 折进 path 前缀即可保证唯一，
 * 同时仍保留可读的函数名，人看图时知道是哪个文件的哪个函数。
 */
function keyedApis(m) {
  const tag = m.id.split('.').slice(-1)[0];
  return m.apis.map((a) => ({
    protocol: a.protocol,
    path: seg(tag) + ':' + String(a.path).slice(0, 80),
    description: a.description,
  }));
}

const frontmatter = (m) => ({
  uid: uid8(m.id), id: m.id, parent: m.parent,
  name: m.name, description: clamp(m.desc),
  source: [], revision: '0'.repeat(40), updated_at: NOW,
  fingerprint: 'pending',
  ...(parentIds.has(m.id) ? {} : { apis: keyedApis(m) }),
  deps: m.deps,
});
for (let i = 0; i < modules.length; i += 40) {
  const batch = modules.slice(i, i + 40).map((m) => ({ frontmatter: frontmatter(m) }));
  const r = await call('normify_module_batch', { items: batch, mode: 'upsert' });
  if (r.ok === false) {
    console.error('批次失败 @' + i + ': ' + JSON.stringify(r.errors || r).slice(0, 600));
    process.exit(1);
  }
}
// ---- 渲染层：让每一层的图可读（阅读导语 + 分组 + 顺序）----
const LAYOUTS = [
  {
    id: 'truman-town-flow',
    mode: 'groups',
    reading: {
      zh: '排查一个非预期数据时按此顺序走：先看【状态单元】确认该值是谁写的、谁读的；再看【主循环阶段】确认它在 tick 的哪一刻被改；若涉及关系/事件则看【图节点类型】；若涉及生命/疾病/企业/文明这类阶段性状态，看【关键状态机】；最后看【诊断】里是否已标注可疑项。',
      en: 'Debugging an unexpected value: check State Units (who writes/reads), then Main-Loop Phases (when in the tick), then Graph Node Types, State Machines, and Diagnostics.',
    },
    groups: [
      { id: 'g-facts',
        title: { zh: '事实：数据实际怎么流', en: 'Facts: how data actually flows' },
        children: ['truman-town-flow.state', 'truman-town-flow.graph', 'truman-town-flow.phases', 'truman-town-flow.machines'] },
      { id: 'g-diag',
        title: { zh: '诊断：静态分析发现的可疑项', en: 'Diagnostics: static findings' },
        children: ['truman-town-flow.diagnostics'] },
    ],
    order: ['truman-town-flow.state', 'truman-town-flow.phases', 'truman-town-flow.graph', 'truman-town-flow.machines', 'truman-town-flow.diagnostics'],
  },
  {
    id: 'truman-town-flow.state.area',
    mode: 'grid',
    reading: {
      zh: '按顶层目录归组。先看【运行时】与【智能体】——主循环与居民状态是 bug 最常出没处；每个领域卡片上标注了「只写不读」与「未纳入复位」的数量，非零即值得点进去。',
      en: 'Grouped by top-level directory. Start with runtime and agent; each card reports never-read and reset-missing counts.',
    },
  },
  {
    id: 'truman-town-flow.phases.order',
    mode: 'layers',
    reading: {
      zh: '按 tick 内的执行顺序排列。排查「某值在那一刻为什么是那样」时，看它前后相邻的阶段即可知道谁先改。',
      en: 'Ordered within a tick.',
    },
  },
];
for (const L of LAYOUTS) {
  const args = { id: L.id, mode: L.mode };
  if (L.reading !== undefined) args.reading = L.reading;
  if (L.groups !== undefined) args.groups = L.groups;
  if (L.order !== undefined) args.order = L.order;
  const lr = await call('normify_layout_upsert', args);
  if (lr.ok === false) console.log('layout 失败 ' + L.id + ': ' + JSON.stringify(lr.errors || lr).slice(0, 200));
}
const rb = await call('normify_build', { repoRoot: ROOT });
const rr = await call('normify_render', {});
console.log('layout+build+render ok=' + rb.ok + '/' + rr.ok);
const v = await call('normify_validate', { repoRoot: ROOT });
console.log('模块 ' + modules.length + ' / validate ok=' + v.ok
  + ' errors=' + (v.errors || []).length + ' warnings=' + (v.warnings || []).length);
for (const e of (v.errors || []).slice(0, 8)) console.log('  E: ' + String(e).slice(0, 180));
const bl = await call('normify_build', { repoRoot: ROOT });
console.log('build ok=' + bl.ok);
if (bl.ok === true) {
  const rd = await call('normify_render', {});
  console.log('render ok=' + rd.ok);
}
