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
 * - **原子可恢复（本轮修复）**：生成永远先落到临时目录，校验通过才整体换入正式目录。
 *   旧版在开头就 rmSync 正式目录，任何中途失败（批次失败 / validate 失败 / 进程被杀）
 *   都会把正式树留成**残缺或空目录**——而它本身是仓库里的交付产物，被清空即丢失证据。
 *
 * 用法：
 *   node bin/flow-to-normify.mjs [--dir <结构数据目录>] [--root <仓库根>]
 *                               [--index <flow-index.json>] [--stage <临时目录>]
 *                               [--check] [--no-promote] [--batch-size <n>]
 *   node bin/flow-to-normify.mjs --help
 *
 * 参数：
 *   --dir <name>     结构数据目录（默认 normify-truman-town-flow；须以 normify- 开头）
 *   --root <path>    仓库根，决定 src/ 与默认 --index 的位置（默认 cwd）
 *   --index <path>   flow-index.json 路径（默认 <root>/flow-index.json）
 *   --stage <path>   生成到该临时目录而不是正式目录（供测试/试跑；正式目录一个字节都不动）
 *   --no-promote     生成到临时目录并校验，但不换入正式目录（= 显式试跑）
 *   --check          只校验既有正式树，不重新生成（只读）
 *   --batch-size <n> 单批模块数（1..200，默认 upsert 40 / patch 20）。
 *                    调小可对抗性验证批次父子边界——边界越多越容易暴露父子被切断。
 *   --help           打印本帮助并退出（0）
 *
 * 故障注入（仅测试）：环境变量 LINYI_FLOW_FAIL_AFTER_BATCH=<n> 会让写入在第 n 批之后
 * 强制失败，用来验证「失败后正式树一个字节没动」。原子性无法靠正常跑通证明，必须真的炸一次。
 *
 * 退出码：0 = 成功（validate 0 error 且 build/render 通过）；1 = 失败（正式树保持原样）。
 */

import { readFileSync, rmSync, existsSync, renameSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTools } from '/home/agentuser/.dsh/profiles/web/node_modules/@dsh-external/dsh-normify/lib/tools.js';

const HELP = `用法: node bin/flow-to-normify.mjs [选项]

把 flow-index.json（数据流转静态索引）转成与 truman-town 同构的 Normify 结构树。

选项:
  --dir <name>     结构数据目录（默认 normify-truman-town-flow，须以 normify- 开头）
  --root <path>    仓库根，决定 src/ 与默认 --index 位置（默认当前工作目录）
  --index <path>   flow-index.json 路径（默认 <root>/flow-index.json）
  --stage <path>   只生成到该临时目录，正式目录一个字节都不动（试跑/测试用）
  --no-promote     同 --stage，临时目录自动取名（试跑）
  --check          只校验既有正式树（只读，不重新生成）
  --batch-size <n> 单批模块数（1..200；默认 upsert 40 / patch 20）
  --help           打印本帮助并退出

退出码:
  0  成功：validate 0 error，build 与 render 均通过
  1  失败：正式树保持原样（生成先落临时目录，校验通过才整体换入）

示例:
  node bin/flow-to-normify.mjs
  node bin/flow-to-normify.mjs --check
  node bin/flow-to-normify.mjs --dir /tmp/normify-flow-test
  node bin/flow-to-normify.mjs --stage /tmp/normify-flow-test --batch-size 3
`;

/** 脚本自身所在仓库根（不依赖 cwd，`--root` 未给时用它兜底）。 */
const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage(msg) {
  if (msg !== undefined) console.error('参数错误: ' + msg + '\n');
  process.stdout.write(HELP);
  process.exit(msg === undefined ? 0 : 2);
}

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
if (argv.includes('--help') || argv.includes('-h')) usage();

const ROOT = resolve(opt('--root') ?? SCRIPT_ROOT);
const DIR = opt('--dir') ?? 'normify-truman-town-flow';
const INDEX_PATH = resolve(opt('--index') ?? join(ROOT, 'flow-index.json'));
const STAGE = opt('--stage') === undefined ? undefined : resolve(opt('--stage'));
const NO_PROMOTE = argv.includes('--no-promote') || STAGE !== undefined;
const CHECK_ONLY = argv.includes('--check');
const KNOWN_OPTS = ['--dir', '--root', '--index', '--stage', '--batch-size', '--no-promote', '--check', '--help', '-h'];
for (const a of argv) {
  if (a.startsWith('--') && !KNOWN_OPTS.includes(a)) usage('未知选项 ' + a);
}

/** 单批模块数：默认 upsert 40 / patch 20（见 writeAll），可用 --batch-size 覆盖。 */
/** 故障注入：写入若干批后强制失败（仅测试用，见 writeAll）。 */
const FAULT_AFTER_BATCH = (() => {
  const raw = process.env.LINYI_FLOW_FAIL_AFTER_BATCH;
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) usage('LINYI_FLOW_FAIL_AFTER_BATCH 必须是非负整数，当前: ' + raw);
  return n;
})();

const BATCH_SIZE = (() => {
  const raw = opt('--batch-size');
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 200) usage('--batch-size 必须是 1..200 的整数，当前: ' + raw);
  return n;
})();
if (DIR.includes('/') || DIR.includes('\\') || !DIR.startsWith('normify-')) {
  usage('--dir 必须是单段目录名且以 normify- 开头，当前: ' + DIR);
}
if (!existsSync(INDEX_PATH)) {
  console.error('找不到 flow-index.json: ' + INDEX_PATH + '（先跑 node bin/flow-index.mjs）');
  process.exit(1);
}

/** 工具上下文：`call` 的 dir 随「本次生成目标」切换，见 runBuild。 */
const map = new Map();
registerTools({ tools: { register(def) { map.set(def.name, def); } } }, { rootDir: ROOT });
let PROJECT_DIR = join(ROOT, DIR);
const call = (name, args) => {
  const def = map.get(name);
  if (def === undefined) throw new Error('未知 normify 工具: ' + name);
  return def.execute({ project: 'truman-town-flow', dir: PROJECT_DIR, ...args });
};

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
const NOW = '2026-01-01T00:00:00Z';

/** 生成整棵树到 PROJECT_DIR。抛异常即视为失败，由 runBuild 负责回滚/不换入。 */
async function generate() {
const idx = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
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
  /** 状态单元 id → 其模块 id，供后续生成跨模块连线时反查。 */
  const STATE_MODULE_BY_KEY = new Map();
  /** 文件路径 → 该文件里定义的状态模块 id 列表（函数名反查模块用）。 */
  const MODULES_BY_FILE = new Map();
  /** 已登记的模块 id 集合与索引（连线时校验端点存在）。 */
  const moduleIds = new Set();
  const moduleById = new Map();
  /** 全部模块登记完成后填充（连线逻辑在其后执行）。 */
  function indexModules() {
    for (const m of modules) {
      if (moduleById.has(m.id)) throw new Error('模块 id 重复: ' + m.id);
      moduleIds.add(m.id);
      moduleById.set(m.id, m);
    }
  }
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
      STATE_MODULE_BY_KEY.set(s.id, sid);
      if (!MODULES_BY_FILE.has(s.file)) MODULES_BY_FILE.set(s.file, []);
      MODULES_BY_FILE.get(s.file).push({ key: s.id, id: sid, name: s.name });
      modules.push({
        id: sid, parent: areaId,
        name: b(s.name, s.name),
        desc: b(
          s.kind + ' 类型，声明于 ' + s.file + ':' + s.line + '。'
          + '写入方 ' + s.writers.length + ' 个、读取方 ' + s.readers.length + ' 个；'
          + (s.resetCovered ? '已纳入复位。' : '**未纳入复位**（跨 run 可能残留）。'),
          s.kind + ' declared at ' + s.file + ':' + s.line + '; writers=' + s.writers.length + ', readers=' + s.readers.length,
        ),
        // API 键即「写入口/读入口」，与下面 deps 的 from_api/to_api 精确对应，
        // 箭头才能钉在框内的具体那一行而不是浮在框边。
        // 这里**不得截断**：deps 的 from_api/to_api 直接引用这些键，
        // 一旦截断就会出现「箭头指向不存在的 API 键」——Normify 报
        // dep/from-api-invalid 或 dep/to-api-invalid，整棵树 build 失败。
        // 实测：accounts / foragePool 各有 10 个读取方，被 slice(0,8) 砍掉 2 个后
        // 就产生了 4 条悬空 from_api。
        // 展示层的截断交给渲染数据的 max_api_rows（见 normify_layout_upsert），
        // 数据层保持完整，才能保证「零入边 = 没人读」这个判读成立。
        apis: [
          ...s.writers.map((w) => ({ protocol: 'rpc', path: 'write-' + w, description: b('写入方 ' + w + '（' + s.file + '）', 'writer ' + w) })),
          ...s.readers.map((r) => ({ protocol: 'rpc', path: 'read-' + r, description: b('读取方 ' + r, 'reader ' + r) })),
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
  indexModules();

  // ============ 连线：把「谁写谁读」变成真正的箭头 ============
  // 第一版把「读者」也建成状态模块之间的边，语义是错的：
  // 读者不是一个状态变量，而是**函数所属的代码模块**。
  // 实测后果：foragePool 的 7 个读者全在 loop.js，却都被画成指向 alive-pop-generation，
  // 因为反查退化成「同文件第一个状态模块」。
  //
  // 正确模型是四层三跳：
  //   写者代码模块 --写--> 状态单元 --读--> 读者代码模块
  // 其中「写者/读者代码模块」是新建的一层（每个有状态的文件一个节点），
  // 由函数名反查得到：函数名 → 声明它的文件 → 该文件对应的代码模块。
  // 于是 loop.js 只出现一次，foragePool 的读边全部汇聚到它，语义正确。
  // Normify 要求 parent === id 去掉最后一段，因此中间层级必须逐个补齐，
  // 不能直接把 src/a/b/c.js 挂到根下（实测报 structure/parent-mismatch）。
  const codeModuleOfFile = new Map();
  function ensureCodeModule(file) {
    if (codeModuleOfFile.has(file)) return codeModuleOfFile.get(file);
    const parts = file.replace(/^src\//, '').replace(/[.]js$/, '').split('/').map(seg);
    let pid = 'truman-town-flow.code';
    if (!moduleIds.has(pid)) {
      modules.push({
        id: pid, parent: 'truman-town-flow',
        name: b('代码模块', 'Code Modules'),
        desc: b('数据流转的端点：每个有状态的文件一个节点。出边=它写的状态，入边=它读的状态。',
          'Data-flow endpoints: one node per file that holds state.'),
        apis: [], deps: [],
      });
      moduleIds.add(pid); moduleById.set(pid, modules[modules.length - 1]);
    }
    for (let i = 0; i < parts.length; i += 1) {
      const cid = pid + '.' + parts[i];
      const isLeaf = i === parts.length - 1;
      if (!moduleIds.has(cid)) {
        modules.push({
          id: cid, parent: pid,
          name: b(isLeaf ? file.replace(/^src\//, '') : parts[i],
            isLeaf ? file.replace(/^src\//, '') : parts[i]),
          desc: isLeaf
            ? b('代码模块 ' + file + '。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。',
                'Code module ' + file + ' as a data-flow endpoint.')
            : b('代码模块目录 ' + parts.slice(0, i + 1).join('/') + '。',
                'Code module directory.'),
          apis: [], deps: [],
        });
        moduleIds.add(cid); moduleById.set(cid, modules[modules.length - 1]);
      }
      pid = cid;
    }
    codeModuleOfFile.set(file, pid);
    return pid;
  }
  for (const s of idx.stores) ensureCodeModule(s.file);

  // 函数名 → 声明它的文件（由 flow-index 的 stores/writers/readers 汇总）。
  const fileOfFunction = new Map();
  for (const s of idx.stores) {
    for (const fn of [...s.writers, ...s.readers]) {
      if (!fileOfFunction.has(fn)) fileOfFunction.set(fn, s.file);
    }
  }

  const edgeSet = new Set();
  function link(fromId, toId, fromApi, toApi, zh, en) {
    if (fromId === undefined || toId === undefined || fromId === toId) return;
    if (!moduleIds.has(fromId) || !moduleIds.has(toId)) return;
    const k = fromId + '#' + toId + '#' + (fromApi || '') + '#' + (toApi || '');
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    moduleById.get(fromId).deps.push({
      kind: 'dataflow', to: toId,
      ...(fromApi === null ? {} : { from_api: fromApi }),
      ...(toApi === null ? {} : { to_api: toApi }),
      label: { zh: zh.slice(0, 30), en: en.slice(0, 30) },
    });
  }

  let writeEdges = 0;
  let readEdges = 0;
  for (const s of idx.stores) {
    const stateId = STATE_MODULE_BY_KEY.get(s.id);
    if (stateId === undefined) continue;
    // label 受 30 字符限制：状态名先截断再拼。
    const sn = s.name.length > 18 ? s.name.slice(0, 18) : s.name;
    for (const w of s.writers) {
      const cid = ensureCodeModule(fileOfFunction.get(w));
      if (cid === undefined) continue;
      link(cid, stateId, null, apiKeyOf(stateId, 'write-' + w),
        '写 ' + sn, 'write ' + sn);
      writeEdges += 1;
    }
    for (const r of s.readers) {
      const cid = ensureCodeModule(fileOfFunction.get(r));
      if (cid === undefined) continue;
      link(stateId, cid, apiKeyOf(stateId, 'read-' + r), null,
        '读 ' + sn, 'read ' + sn);
      readEdges += 1;
    }
  }

  const parentIds = new Set(modules.filter((m) => m.parent !== null).map((m) => m.parent));

  /**
   * API 键（protocol:path）在全项目内必须唯一，而「读取方函数名」会在多个模块里重复出现
   * （同一个 loop.js 读很多状态）。把模块 id 折进 path 前缀即可保证唯一，
   * 同时仍保留可读的函数名，人看图时知道是哪个文件的哪个函数。
   *
   * **单一真源（本轮修复）**：写进模块文件的 apis[].path 与依赖箭头里的
   * from_api/to_api 必须由**同一个函数**算出。旧版这里是两处独立实现——
   * keyedApis 把 path 截断到 80 字符，apiKeyOf 不截断——于是只要某个函数名
   * 把键顶过 80 字符，两处就得到**不同的键**：apis 里是截断版、箭头里是全量版，
   * Normify 直接报 dep/from-api-invalid（箭头指向不存在的 API），build 失败。
   * 现在两处都调 apiKeyOf，且**不做任何截断**：键必须完整，展示层的折叠交给
   * 渲染数据的 max_api_rows（数据层截断会让「零入边 = 没人读」这个判读失真）。
   */
  function apiKeyOf(moduleId, path, protocol) {
    const proto = String(protocol ?? 'rpc').toLowerCase();
    return proto + ':' + seg(moduleId.split('.').slice(-1)[0]) + ':' + path;
  }
  /** 模块落盘后的 API 键集合——apis[] 与 deps 共用它做自检。 */
  function apiKeysOf(m) {
    return new Set(m.apis.map((a) => apiKeyOf(m.id, a.path, a.protocol)));
  }
  function keyedApis(m) {
    return m.apis.map((a) => ({
      protocol: a.protocol,
      path: apiKeyOf(m.id, a.path, a.protocol).slice(a.protocol.length + 1),
      description: a.description,
    }));
  }
  /**
   * 写盘前自检：每条箭头的 from_api/to_api 都必须存在于「将要写进文件的」键集合里。
   * 与其等 Normify 在写完几百个模块之后报 dep/from-api-invalid，不如先拦下来，
   * 错误信息里直接给出模块 id 与那个键。
   */
  function assertAnchorsResolvable() {
    const keysByModule = new Map(modules.map((m) => [m.id, apiKeysOf(m)]));
    const bad = [];
    for (const m of modules) {
      for (const d of m.deps ?? []) {
        if (d.from_api !== undefined && !(keysByModule.get(m.id) ?? new Set()).has(d.from_api)) {
          bad.push(m.id + ' 的 from_api=' + d.from_api + ' 不在本模块 apis 中');
        }
        if (d.to_api !== undefined && !(keysByModule.get(d.to) ?? new Set()).has(d.to_api)) {
          bad.push(m.id + ' -> ' + d.to + ' 的 to_api=' + d.to_api + ' 不在目标模块 apis 中');
        }
      }
    }
    if (bad.length > 0) {
      throw new Error('API 锚点不一致（' + bad.length + ' 条），拒绝写盘：\n  ' + bad.slice(0, 12).join('\n  '));
    }
    return keysByModule;
  }

  /**
   * 写盘顺序：按 id 深度升序（同深度按 id 字典序，稳定）。这是**批次父子边界**的结构保证。
   *
   * 为什么必须显式排序：normify_module_batch 的预检中，父模块只要不在
   * 「已落盘集合 ∪ 本批」里，就报 structure/parent-not-exist，且**整批原子回滚**。
   * 旧版直接把 modules[] 按 40 个一刀切——而 modules[] 的顺序取决于
   * ensureCodeModule 的**惰性创建顺序**（代码模块是在连线循环里边走边 push 的），
   * 于是「父模块落在第 N 批、子模块落在第 N+1 批」这类边界随时可能出现，
   * 一旦出现就是整批失败。按深度排序后父模块深度必然小于子模块，
   * 边界怎么切都切不断父子关系。
   */
  function inWriteOrder(list) {
    return list
      .map((m, i) => ({ m, i, depth: m.id.split('.').length }))
      .sort((a, c) => (a.depth - c.depth) || a.m.id.localeCompare(c.m.id) || (a.i - c.i))
      .map((x) => x.m);
  }

  /**
   * 写盘必须分两轮：
   *   第一轮只建模块（deps 为空）——矢量的目标模块可能还没落盘，
   *     同批校验会报 dep/target-missing（实测如此）；
   *   第二轮再用 patch 补 deps——此时全部端点都已存在。
   * 代价是多一轮写入，换来的是「箭头永远指向真实存在的模块」。
   */
  const frontmatter = (m, withDeps) => ({
    uid: uid8(m.id), id: m.id, parent: m.parent,
    name: m.name, description: clamp(m.desc),
    source: [], revision: '0'.repeat(40), updated_at: NOW,
    fingerprint: 'pending',
    ...(parentIds.has(m.id) ? {} : { apis: keyedApis(m) }),
    deps: withDeps ? m.deps : [],
  });
  async function writeAll(withDeps) {
    const items = inWriteOrder(modules)
      .filter((m) => withDeps ? m.deps.length > 0 : true)
      .map((m) => withDeps
        ? { patch: { id: m.id, patch: { deps: m.deps } } }
        : { frontmatter: frontmatter(m, false) });
    const mode = withDeps ? 'patch' : 'upsert';
    // 单批上限 200（Normify 硬约束）；默认 40/20 只是为了让单批失败的重试成本低。
    // --batch-size 可压到个位数，用来**对抗性**验证批次边界（边界越多越容易暴露父子切断）。
    const size = Math.max(1, Math.min(200, BATCH_SIZE ?? (withDeps ? 20 : 40)));
    let batchNo = 0;
    for (let i = 0; i < items.length; i += size) {
      // 故障注入（仅测试用）：写完第 N 批之后强制失败，用来验证「失败后正式树一个字节没动」。
      // 这不是调试残留：原子性本身没法靠「正常跑通」证明，必须真的在写到一半时炸一次。
      if (FAULT_AFTER_BATCH !== undefined && batchNo >= FAULT_AFTER_BATCH) {
        throw new Error('fault-injection: 已在 ' + (withDeps ? 'patch' : 'upsert') + ' 轮写入 ' + batchNo + ' 批后强制失败');
      }
      batchNo += 1;
      const r = await call('normify_module_batch', { items: items.slice(i, i + size), mode });
      if (r.ok === false) {
        // 抛异常而不是 process.exit：批次可能只写了一部分，
        // 调用方必须能整体回滚（丢弃临时目录），而不是把半棵树留在盘上。
        throw new Error((withDeps ? '补 deps 失败 @' : '建模块失败 @') + i + ': '
          + JSON.stringify(r.errors || r).slice(0, 800));
      }
    }
  }
  // 写盘前先证明「箭头端点全部可解析」——锚点不一致就不该浪费一次几百模块的写入。
  assertAnchorsResolvable();
  await writeAll(false);
  await writeAll(true);
  // ---- 渲染层：让每一层的图可读（阅读导语 + 分组 + 顺序）----
  const LAYOUTS = [
    {
      id: 'truman-town-flow',
      mode: 'groups',
      reading: {
        zh: '排查非预期数据时按此顺序：①【代码模块】找写它的文件（出边是它写的状态）；②【状态单元】看这个值被谁写、被谁读，箭头两端都锚定到具体函数；③【主循环阶段】确认它在 tick 的哪一刻被改；④【关键状态机】确认当前处于哪个状态、怎么迁移的；⑤【诊断】核对是否已知项。注意：状态单元之间**没有**直接连线，流转一律经【代码模块】中转——写者文件 →(写) 状态 →(读) 读者文件，这样才看得出跨文件的真实依赖。',
        en: 'Debug order: Code Modules (which file writes it) then State Units (who writes/reads, anchored to functions), Main-Loop Phases (when in the tick), State Machines, Diagnostics.',
      },
      groups: [
        { id: 'g-code', title: { zh: '端点：数据从哪个文件流出/流入', en: 'Endpoints: code modules' }, children: ['truman-town-flow.code'] },
        { id: 'g-facts', title: { zh: '事实：状态与读写方', en: 'Facts: state and accessors' }, children: ['truman-town-flow.state', 'truman-town-flow.graph', 'truman-town-flow.phases', 'truman-town-flow.machines'] },
        { id: 'g-diag', title: { zh: '诊断：静态发现', en: 'Diagnostics' }, children: ['truman-town-flow.diagnostics'] },
      ],
      order: ['truman-town-flow.code', 'truman-town-flow.state', 'truman-town-flow.phases', 'truman-town-flow.graph', 'truman-town-flow.machines', 'truman-town-flow.diagnostics'],
    },
    {
      id: 'truman-town-flow.code',
      mode: 'layers',
      reading: {
        zh: '按源码目录组织的代码模块。点开任一文件：出边是它写入的状态单元（锚定到具体写函数），入边是它读取的状态单元。跨文件的数据流依赖都在这一层显现。',
        en: 'Code modules by source directory. Out-edges = state written; in-edges = state read.',
      },
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
    // 渲染数据失败必须**抛错**，不能只打印一行就继续：
    // 少了渲染数据，树仍然 build 得出来，但每一层的图退化成自动布局、
    // 阅读导语与分组全丢，而且只表现为 validate 的一串 layout/missing warning——
    // 等于「静默降级」。实测：结构目录名不以 normify- 开头时，4 层渲染数据全部丢失，
    // 脚本却照常输出 build ok=true 并以 0 退出。
    if (lr.ok === false) {
      throw new Error('layout 失败 ' + L.id + ': ' + JSON.stringify(lr.errors || lr).slice(0, 400));
    }
  }
  // ---- 架构规则：数据流转图**天然有环**，必须替换默认的 core-acyclic ----
  // A 模块写状态 X、B 模块读 X；B 又写状态 Y、A 读 Y —— 这就是环，
  // 但它描述的正是「两个模块互相影响」这一事实，不是设计缺陷。
  // truman-town 树描述调用依赖，环是 defect；本树描述数据流转，环是**常态**。
  // 因此这里安装一份只保留「结构正确性」的规则集，去掉 acyclic。
  const policy = await call('normify_policy_get', {});
  if (policy.ok !== false) {
    await call('normify_policy_upsert', {
      rules: [
        {
          id: 'flow-no-deprecated-target',
          type: 'forbid-dependency',
          severity: 'warning',
          from: ['**'], to: ['**'], toState: 'deprecated',
        },
      ],
    });
  }

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
}

// ==================== 原子换入 ====================
/**
 * 生成先落临时目录，校验通过才整体换入正式目录。
 *
 * 为什么不能直接写正式目录：正式目录是仓库交付产物（tree.json / receipt.json /
 * normify.html 都进 git）。旧版开头就 rmSync 正式目录，一旦中途失败——批次失败、
 * validate 报错、进程被 OOM 杀掉——留下的是**半棵或空树**，等于把证据删了。
 * 换入用「旧目录改名备份 → 临时目录改名就位 → 删除备份」三步，
 * 任一步失败都能把备份改回来，正式树永远不会处于「既非旧也非新」的状态。
 */
function dirFingerprint(dir) {
  let files = 0;
  let bytes = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { files += 1; bytes += statSync(p).size; }
    }
  };
  if (existsSync(dir)) walk(dir);
  return { files, bytes };
}

function promote(stageDir, targetDir) {
  const backup = targetDir + '.bak-' + process.pid;
  const hadTarget = existsSync(targetDir);
  if (hadTarget) {
    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
    renameSync(targetDir, backup);
  }
  try {
    renameSync(stageDir, targetDir);
  } catch (e) {
    if (hadTarget && !existsSync(targetDir) && existsSync(backup)) renameSync(backup, targetDir);
    throw e;
  }
  if (hadTarget) rmSync(backup, { recursive: true, force: true });
}

/**
 * 校验 + 编译 + 渲染。返回 {ok, modules, errors, warnings, receipt}。
 * 门禁顺序即交付标准：validate 必须 0 error（不产产物），build 必须 ok（否则不写 tree.json），
 * render 必须 ok（否则 normify.html 缺失）。任一不过即整体失败，调用方丢弃临时目录。
 */
async function verify() {
  const v = await call('normify_validate', { repoRoot: ROOT });
  const errs = v.errors || [];
  const warns = v.warnings || [];
  for (const e of errs.slice(0, 8)) console.log('  E: ' + String(e).slice(0, 200));
  if (v.ok !== true) {
    console.log('validate ok=false errors=' + errs.length + ' warnings=' + warns.length);
    return { ok: false, modules: 0, errors: errs.length, warnings: warns.length };
  }
  const bl = await call('normify_build', { repoRoot: ROOT });
  if (bl.ok !== true) {
    console.log('validate ok=true errors=0 warnings=' + warns.length + ' / build ok=false');
    for (const e of (bl.errors || []).slice(0, 8)) console.log('  BE: ' + String(e).slice(0, 200));
    return { ok: false, modules: 0, errors: 0, warnings: warns.length };
  }
  const rd = await call('normify_render', {});
  const modules = bl.receipt?.stats?.module_count ?? 0;
  console.log('validate ok=true errors=0 warnings=' + warns.length
    + ' / build ok=true / render ok=' + rd.ok + '（模块 ' + modules + '）');
  return { ok: rd.ok === true, modules, errors: 0, warnings: warns.length };
}

const targetDir = join(ROOT, DIR);

if (CHECK_ONLY) {
  PROJECT_DIR = targetDir;
  if (!existsSync(targetDir)) {
    console.error('--check: 结构数据目录不存在: ' + targetDir);
    process.exit(1);
  }
  console.log('check-only: ' + targetDir);
  process.exit((await verify()).ok === true ? 0 : 1);
}

// 临时目录与正式目录同父目录（同一文件系统 → rename 才是原子操作；跨设备 rename 会抛 EXDEV）
// 临时目录名也必须以 normify- 开头：Normify 的 project/dir-name 校验会拒绝其它前缀。
// 用 `normify-<目标名>-stage-<pid>` 而非 `.` 开头的隐藏名，既过校验又与原目录同父（rename 同文件系统）。
const stageDir = STAGE ?? join(dirname(targetDir), 'normify-' + DIR.replace(/^normify-/, '') + '-stage-' + process.pid);
const before = dirFingerprint(targetDir);
console.log('生成到临时目录: ' + stageDir + '（正式目录当前 ' + before.files + ' 文件，换入前不动）');
rmSync(stageDir, { recursive: true, force: true });

PROJECT_DIR = stageDir;
let res = { ok: false };
try {
  await generate();
  res = await verify();
} catch (e) {
  console.error('生成失败: ' + (e instanceof Error ? e.stack ?? e.message : String(e)));
  res = { ok: false };
}
if (res.ok !== true) {
  // 失败：临时目录清掉，正式目录保持原样（这是旧版最危险的缺口）
  rmSync(stageDir, { recursive: true, force: true });
  const after = dirFingerprint(targetDir);
  console.log('失败：已丢弃临时目录；正式树未改动（' + after.files + ' 文件 / ' + after.bytes + ' 字节）');
  process.exit(1);
}

if (NO_PROMOTE) {
  console.log('试跑成功（--stage/--no-promote）：未换入正式目录。临时树留在 ' + stageDir);
  process.exit(0);
}

const staged = dirFingerprint(stageDir);
try {
  promote(stageDir, targetDir);
} catch (e) {
  console.error('换入失败: ' + (e instanceof Error ? e.message : String(e)));
  rmSync(stageDir, { recursive: true, force: true });
  console.log('正式树未改动（' + dirFingerprint(targetDir).files + ' 文件）');
  process.exit(1);
}
// 换入后对正式目录再校验一次：证明「换入的这份」本身就是绿的，
// 而不是「临时目录那份是绿的」（换入可能因为文件系统差异产生不同结果，必须实测）。
PROJECT_DIR = targetDir;
const finalRes = await verify();
console.log('换入完成: ' + staged.files + ' 文件 / ' + staged.bytes + ' 字节 → ' + targetDir);
if (finalRes.ok !== true) {
  console.error('换入后校验失败：正式目录处于「已换入但不绿」状态，请回滚到上一版或重跑。');
  process.exit(1);
}
console.log('正式树就绪：模块 ' + finalRes.modules + '，errors=0，warnings=' + finalRes.warnings + '。');
process.exit(0);
