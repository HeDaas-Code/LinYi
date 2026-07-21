<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import * as d3 from 'd3'
import type {
  WorldCharacterEntry,
  WorldFactionEntry,
  WorldGeographyEntry,
  WorldSnapshotResponse,
} from '@/types'

// WorldGraph — Stage 5 Task 5.2 SubTask 5.2.1
//
// 世界图谱组件：地点 / 势力 / 角色关系图。
//
// 实现选择：SVG + d3-force（而不是 PixiJS）。
//   - 现有 SocialView 的 PixiCanvas 主要服务于 tilemap + 精灵动画，专门
//     针对单个空间内的像素地图渲染；世界图谱是拓扑图（节点 + 边），用
//     d3-force + SVG 更直接、更可靠，也符合任务说明“如果 PixiJS 太复杂
//     可以用 SVG/Canvas 2D 替代”的建议。
//   - d3 已在 package.json 依赖中（^7.9.0 + @types/d3），无需新增依赖。
//
// 节点类型：
//   - location（地点，来自 snapshot.geography）
//   - faction（势力，来自 snapshot.factions）
//   - character（角色，来自 snapshot.characters）
// 边类型：
//   - character→character（角色关系，来自 characters[].relationships）
//   - faction→location（势力-地点归属，依据 factions[].territory 匹配）

interface GraphNode {
  id: string
  label: string
  kind: 'location' | 'faction' | 'character'
  raw: WorldGeographyEntry | WorldFactionEntry | WorldCharacterEntry
  x: number
  y: number
  fx?: number | null
  fy?: number | null
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  kind: 'relationship' | 'territory'
  label?: string
}

const props = defineProps<{
  snapshot: WorldSnapshotResponse | null
  loading?: boolean
  error?: string | null
}>()

// 选中的节点 id（用于显示详情面板）。
const selectedNodeId = ref<string | null>(null)

const width = 760
const height = 520

const nodes = shallowRef<GraphNode[]>([])
const links = shallowRef<GraphLink[]>([])
// 每帧 tick 后的 transform 字符串，用于 <g> 容器统一平移/缩放。
const tickCount = ref(0)

const selectedNode = computed<GraphNode | null>(() => {
  if (!selectedNodeId.value) return null
  return nodes.value.find((n) => n.id === selectedNodeId.value) ?? null
})

// 把 WorldSnapshot 拆成节点和边。地点用 key 作为 id；势力用 key；角色用
// character_id。territory 既可能是字符串也可能是数组，统一展平后用 label
// 模糊匹配地点名称或 key。
function buildGraph(snap: WorldSnapshotResponse): { nodes: GraphNode[]; links: GraphLink[] } {
  const ns: GraphNode[] = []
  const ls: GraphLink[] = []

  for (const g of snap.geography ?? []) {
    const id = g.key
    if (!id) continue
    ns.push({
      id: `loc:${id}`,
      label: (g.name as string) || id,
      kind: 'location',
      raw: g,
      x: width / 2 + (Math.random() - 0.5) * 80,
      y: height / 2 + (Math.random() - 0.5) * 80,
    })
  }
  for (const f of snap.factions ?? []) {
    const id = (f.faction_id as string) || f.key
    if (!id) continue
    ns.push({
      id: `fac:${id}`,
      label: (f.name as string) || id,
      kind: 'faction',
      raw: f,
      x: width / 2 + (Math.random() - 0.5) * 80,
      y: height / 2 + (Math.random() - 0.5) * 80,
    })
    // faction → location 边
    const territory = f.territory
    const territories: string[] = []
    if (typeof territory === 'string') territories.push(territory)
    else if (Array.isArray(territory)) territories.push(...territory.filter((t): t is string => typeof t === 'string'))
    for (const t of territories) {
      const locNode = ns.find((n) => n.kind === 'location' && (n.label === t || n.id === `loc:${t}`))
      if (locNode) {
        ls.push({
          source: `fac:${id}`,
          target: locNode.id,
          kind: 'territory',
        })
      }
    }
  }
  for (const c of snap.characters ?? []) {
    const id = c.character_id
    if (!id) continue
    ns.push({
      id: `char:${id}`,
      label: c.name || id,
      kind: 'character',
      raw: c,
      x: width / 2 + (Math.random() - 0.5) * 80,
      y: height / 2 + (Math.random() - 0.5) * 80,
    })
    for (const rel of c.relationships ?? []) {
      const targetId = rel.target_id
      if (!targetId) continue
      // 仅在两端角色都存在时连边，避免悬空 target。
      const exists = snap.characters.some((oc) => oc.character_id === targetId)
      if (!exists) continue
      ls.push({
        source: `char:${id}`,
        target: `char:${targetId}`,
        kind: 'relationship',
        label: rel.type,
      })
    }
  }
  return { nodes: ns, links: ls }
}

// d3-force simulation 实例。用 shallowRef 避免被 Vue 的深度响应式代理
// 包裹（与 usePixiApp.ts 同样的理由 — class 实例不应被 reactive 化）。
let simulation: d3.Simulation<GraphNode, undefined> | null = null

function runSimulation(ns: GraphNode[], ls: GraphLink[]): void {
  if (simulation) {
    simulation.stop()
    simulation = null
  }
  if (!ns.length) {
    nodes.value = []
    links.value = []
    return
  }
  // 复制一份给 d3，避免直接修改原始节点的 x/y 引发响应式副作用。
  const simNodes: GraphNode[] = ns.map((n) => ({ ...n }))
  const simLinks: d3.SimulationLinkDatum<GraphNode>[] = ls.map((l) => ({
    source: (l.source as string),
    target: (l.target as string),
  }))

  simulation = d3.forceSimulation<GraphNode>(simNodes)
    .force('link', d3.forceLink<GraphNode, d3.SimulationLinkDatum<GraphNode>>(simLinks)
      .id((d) => d.id)
      .distance(80)
      .strength(0.25))
    .force('charge', d3.forceManyBody().strength(-180))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d.kind) + 6))
    .alpha(1)
    .alphaDecay(0.04)
    .on('tick', () => {
      // 通过引用更新 + 强制 ref 触发响应式重渲染。
      nodes.value = simNodes.slice()
      links.value = ls.map((l) => ({
        ...l,
        source: l.source,
        target: l.target,
      }))
      // bump 一个计数器以保证模板中的 :href 计算属性重算
      tickCount.value += 1
    })
}

function nodeRadius(kind: GraphNode['kind']): number {
  switch (kind) {
    case 'location': return 14
    case 'faction': return 18
    case 'character': return 10
  }
}

function nodeColor(kind: GraphNode['kind']): string {
  // 与 main.css 的 token 颜色对齐：地点用 cen(蓝)，势力用 sn(红)，角色用 dmn(紫)。
  switch (kind) {
    case 'location': return 'var(--cen)'
    case 'faction': return 'var(--sn)'
    case 'character': return 'var(--dmn)'
  }
}

function nodeFill(kind: GraphNode['kind']): string {
  switch (kind) {
    case 'location': return 'var(--cen-soft)'
    case 'faction': return 'var(--sn-soft)'
    case 'character': return 'var(--dmn-soft)'
  }
}

function kindLabel(kind: GraphNode['kind']): string {
  switch (kind) {
    case 'location': return '地点'
    case 'faction': return '势力'
    case 'character': return '角色'
  }
}

function linkColor(kind: GraphLink['kind']): string {
  return kind === 'relationship' ? 'var(--dmn)' : 'var(--sn)'
}

// 计算边端点（d3-force 内部会把 source/target 替换成节点引用，所以这里
// 兼容字符串和节点对象两种形态）。
function linkEndpoint(end: string | GraphNode): GraphNode | null {
  if (typeof end === 'string') {
    return nodes.value.find((n) => n.id === end) ?? null
  }
  return end
}

function selectNode(id: string): void {
  selectedNodeId.value = selectedNodeId.value === id ? null : id
}

function clearSelection(): void {
  selectedNodeId.value = null
}

const stats = computed(() => {
  const loc = nodes.value.filter((n) => n.kind === 'location').length
  const fac = nodes.value.filter((n) => n.kind === 'faction').length
  const chr = nodes.value.filter((n) => n.kind === 'character').length
  const rel = links.value.filter((l) => l.kind === 'relationship').length
  const ter = links.value.filter((l) => l.kind === 'territory').length
  return { loc, fac, chr, rel, ter }
})

// 当 snapshot 变化时重建图谱。
watch(
  () => props.snapshot,
  (snap) => {
    if (!snap) {
      nodes.value = []
      links.value = []
      selectedNodeId.value = null
      return
    }
    const { nodes: ns, links: ls } = buildGraph(snap)
    runSimulation(ns, ls)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (simulation) {
    simulation.stop()
    simulation = null
  }
})

// 暴露给模板的渲染数据 — 用 computed 包一层确保 tickCount 变化时重算。
const renderNodes = computed<GraphNode[]>(() => {
  void tickCount.value
  return nodes.value
})
const renderLinks = computed<GraphLink[]>(() => {
  void tickCount.value
  return links.value
})
</script>

<template>
  <div class="world-graph">
    <div class="graph-toolbar">
      <div class="graph-stats">
        <span class="stat"><span class="dot loc" />{{ stats.loc }} 地点</span>
        <span class="stat"><span class="dot fac" />{{ stats.fac }} 势力</span>
        <span class="stat"><span class="dot chr" />{{ stats.chr }} 角色</span>
        <span class="stat muted">{{ stats.rel }} 关系 · {{ stats.ter }} 归属</span>
      </div>
      <button class="link-btn" @click="clearSelection" v-if="selectedNodeId">清除选择</button>
    </div>

    <div class="graph-canvas-wrap">
      <div v-if="loading" class="graph-overlay">加载中…</div>
      <div v-else-if="error" class="graph-overlay error">
        接口不可用：{{ error }}
        <p class="hint muted">请确认后端 web/app.py 已实现 <code>GET /debug/world/snapshot</code>。</p>
      </div>
      <div v-else-if="!snapshot" class="graph-overlay muted">暂无世界快照</div>
      <div v-else-if="!renderNodes.length" class="graph-overlay muted">当前快照没有可渲染的节点</div>

      <svg
        v-if="snapshot && renderNodes.length"
        class="graph-svg"
        :viewBox="`0 0 ${width} ${height}`"
        preserveAspectRatio="xMidYMid meet"
      >
        <!-- edges -->
        <g class="links">
          <line
            v-for="(l, i) in renderLinks"
            :key="`l-${i}`"
            :x1="linkEndpoint(l.source)?.x ?? 0"
            :y1="linkEndpoint(l.source)?.y ?? 0"
            :x2="linkEndpoint(l.target)?.x ?? 0"
            :y2="linkEndpoint(l.target)?.y ?? 0"
            :class="['link', l.kind]"
            :stroke="linkColor(l.kind)"
          />
        </g>

        <!-- nodes -->
        <g class="nodes">
          <g
            v-for="n in renderNodes"
            :key="n.id"
            :transform="`translate(${n.x},${n.y})`"
            :class="['node', n.kind, { selected: selectedNodeId === n.id }]"
            @click.stop="selectNode(n.id)"
          >
            <circle
              :r="nodeRadius(n.kind)"
              :fill="nodeFill(n.kind)"
              :stroke="nodeColor(n.kind)"
              stroke-width="2"
            />
            <text
              class="node-label"
              :y="nodeRadius(n.kind) + 12"
              text-anchor="middle"
            >{{ n.label }}</text>
          </g>
        </g>
      </svg>
    </div>

    <!-- 详情面板 -->
    <aside class="node-detail" v-if="selectedNode">
      <header class="detail-head">
        <span class="kind-tag" :class="selectedNode.kind">{{ kindLabel(selectedNode.kind) }}</span>
        <span class="detail-title">{{ selectedNode.label }}</span>
        <button class="link-btn" @click="clearSelection">×</button>
      </header>
      <dl class="detail-fields">
        <template v-for="(v, k) in selectedNode.raw" :key="k">
          <dt>{{ k }}</dt>
          <dd>
            <span v-if="Array.isArray(v)">{{ v.length ? v.join(' · ') : '—' }}</span>
            <span v-else-if="typeof v === 'object' && v !== null">[object]</span>
            <span v-else>{{ v ?? '—' }}</span>
          </dd>
        </template>
      </dl>
    </aside>
  </div>
</template>

<style scoped>
.world-graph {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 12px;
  align-items: stretch;
}

.graph-toolbar {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
}

.graph-stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.loc { background: var(--cen); }
.dot.fac { background: var(--sn); }
.dot.chr { background: var(--dmn); }

.graph-canvas-wrap {
  position: relative;
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  overflow: hidden;
  min-height: 520px;
}

.graph-svg {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
}

.node {
  cursor: pointer;
  transition: opacity 0.15s var(--ease-out);
}
.node:hover circle {
  stroke-width: 3;
}
.node.selected circle {
  stroke-width: 4;
  filter: drop-shadow(0 0 6px currentColor);
}

.node-label {
  font-size: 11px;
  fill: var(--text-primary);
  pointer-events: none;
  paint-order: stroke;
  stroke: var(--bg-0);
  stroke-width: 3px;
  stroke-linejoin: round;
}

.link {
  opacity: 0.55;
  stroke-width: 1.5;
}
.link.relationship { stroke-dasharray: none; }
.link.territory { stroke-dasharray: 4 3; }

.graph-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  background: rgba(10, 13, 20, 0.6);
  pointer-events: none;
}
.graph-overlay.error {
  color: var(--error);
  padding: 0 32px;
  text-align: center;
}
.graph-overlay .hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 8px;
}
.graph-overlay code {
  font-family: var(--font-mono);
  background: var(--bg-3);
  padding: 1px 4px;
  border-radius: 3px;
}

.node-detail {
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 520px;
  overflow-y: auto;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kind-tag {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-3);
  color: var(--text-secondary);
}
.kind-tag.location { background: var(--cen-soft); color: var(--cen); }
.kind-tag.faction { background: var(--sn-soft); color: var(--sn); }
.kind-tag.character { background: var(--dmn-soft); color: var(--dmn); }

.detail-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  word-break: break-all;
}

.link-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--cen);
  padding: 2px 10px;
  font-size: 12px;
  border-radius: 10px;
  cursor: pointer;
}
.link-btn:hover { background: var(--cen-soft); }

.detail-fields {
  margin: 0;
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 6px 10px;
  font-size: 12px;
}
.detail-fields dt {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}
.detail-fields dd {
  margin: 0;
  color: var(--text-primary);
  word-break: break-all;
}

.muted { color: var(--text-muted); }

@media (max-width: 900px) {
  .world-graph {
    grid-template-columns: 1fr;
  }
  .node-detail {
    max-height: none;
  }
}
</style>
