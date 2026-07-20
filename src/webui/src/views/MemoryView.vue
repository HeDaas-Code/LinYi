<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { Fragment, Trace } from '@/types'
import { downloadSvgAsPng, timestampSlug } from '@/utils/export'

// MemoryView (记忆宫殿) — Phase 2.
//
// Three panels:
//   1. Left: fragment list with source filter + sort selector
//   2. Middle: trace list with role filter + sort selector
//   3. Right: graph visualization (force-directed, inline SVG)
//
// Data sources:
//   - /api/memory/fragments (new in Phase 2)
//   - /api/memory/traces (new in Phase 2)
//   - /api/memory/graph (existing) — rendered as a simple radial layout
//     because the existing export_graph() returns nodes+edges with no
//     positions; Phase 3 will swap in D3 force layout.

const store = useAgentStore()

const fragments = computed<Fragment[]>(() => store.memoryFragments?.fragments ?? [])
const fragmentTotal = computed(() => store.memoryFragments?.total ?? 0)
const traces = computed<Trace[]>(() => store.memoryTraces?.traces ?? [])
const traceTotal = computed(() => store.memoryTraces?.total ?? 0)

const nodes = computed(() => store.memoryGraph?.nodes ?? [])
const edges = computed(() => store.memoryGraph?.edges ?? [])

const fragmentSource = ref<string>('')
const fragmentSort = ref<'recency' | 'salience' | 'valence'>('recency')
const traceRole = ref<string>('')
const traceSort = ref<'importance' | 'recency' | 'relevance'>('importance')

const SOURCES = ['', 'personal', 'social', 'dream', 'novel', 'dmn', 'cen', 'sandbox', 'memory']
const ROLES = ['', 'setting', 'character', 'event', 'theme', 'mood']

function reloadFragments() {
  store.fetchMemoryFragments(fragmentSource.value || undefined, fragmentSort.value, 100)
}

function reloadTraces() {
  store.fetchMemoryTraces(traceRole.value || undefined, traceSort.value, 100)
}

function fmtTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// ---- Graph rendering: simple radial layout --------------------------------

interface GraphNode {
  id: string
  label: string
  type: string
  role: string
  x: number
  y: number
}

const GRAPH_W = 480
const GRAPH_H = 480
const GRAPH_CX = GRAPH_W / 2
const GRAPH_CY = GRAPH_H / 2
const GRAPH_R = 180

const graphNodes = computed<GraphNode[]>(() => {
  const ns = nodes.value.slice(0, 80) // cap to keep SVG responsive
  const n = ns.length
  if (n === 0) return []
  return ns.map((node, i) => {
    // Place on a circle, fragments inner, traces outer.
    const angle = (Math.PI * 2 * i) / n
    const r = node.type === 'trace' ? GRAPH_R : GRAPH_R * 0.55
    return {
      ...node,
      x: GRAPH_CX + Math.cos(angle) * r,
      y: GRAPH_CY + Math.sin(angle) * r,
    }
  })
})

const graphEdges = computed(() => {
  const ns = graphNodes.value
  const idSet = new Set(ns.map((n) => n.id))
  // Only render edges between visible nodes; cap to avoid clutter.
  return edges.value
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .slice(0, 200)
    .map((e) => {
      const s = ns.find((n) => n.id === e.source)!
      const t = ns.find((n) => n.id === e.target)!
      return { ...e, x1: s.x, y1: s.y, x2: t.x, y2: t.y }
    })
})

const selectedFragmentId = ref<string | null>(null)
const selectedTraceId = ref<string | null>(null)

const graphSvg = ref<SVGSVGElement | null>(null)

function exportGraphPng(): void {
  if (!graphSvg.value) return
  downloadSvgAsPng(
    graphSvg.value,
    `memory-graph-${timestampSlug()}.png`,
    2,
  )
}

const selectedFragment = computed<Fragment | null>(() => {
  if (!selectedFragmentId.value) return null
  return fragments.value.find((f) => f.id === selectedFragmentId.value) ?? null
})

const selectedTrace = computed<Trace | null>(() => {
  if (!selectedTraceId.value) return null
  return traces.value.find((t) => t.id === selectedTraceId.value) ?? null
})

function selectFragment(id: string) {
  selectedFragmentId.value = selectedFragmentId.value === id ? null : id
}

function selectTrace(id: string) {
  selectedTraceId.value = selectedTraceId.value === id ? null : id
}

function selectGraphNode(id: string) {
  // Try fragments first, then traces.
  const f = fragments.value.find((x) => x.id === id)
  if (f) {
    selectedFragmentId.value = id
    selectedTraceId.value = null
    return
  }
  const t = traces.value.find((x) => x.id === id)
  if (t) {
    selectedTraceId.value = id
    selectedFragmentId.value = null
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  reloadFragments()
  reloadTraces()
  if (!store.memoryGraph) {
    store.fetchMemoryGraph()
  }
  // Memory changes slowly; refresh every 30s.
  pollTimer = setInterval(() => {
    reloadFragments()
    reloadTraces()
    store.fetchMemoryGraph()
  }, 30000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="memory-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">记忆宫殿</h1>
        <div class="view-subtitle">
          Fragment → Trace 巩固流 · 共 {{ fragmentTotal }} 片段 / {{ traceTotal }} 轨迹
        </div>
      </div>
    </header>

    <div class="memory-layout">
      <!-- Fragments column -->
      <section class="card list-card">
        <div class="list-header">
          <h2 class="card-title">Fragment</h2>
          <div class="filters">
            <select v-model="fragmentSource" @change="reloadFragments" class="filter-select">
              <option v-for="s in SOURCES" :key="s" :value="s">{{ s || '全部来源' }}</option>
            </select>
            <select v-model="fragmentSort" @change="reloadFragments" class="filter-select">
              <option value="recency">最近</option>
              <option value="salience">显著度</option>
              <option value="valence">效价</option>
            </select>
          </div>
        </div>
        <ul class="frag-list" v-if="fragments.length">
          <li
            v-for="f in fragments.slice(0, 50)"
            :key="f.id"
            class="frag-row"
            :class="{ selected: selectedFragmentId === f.id }"
            @click="selectFragment(f.id)"
          >
            <div class="frag-row-head">
              <span class="tag" :class="`source-${f.source}`">{{ f.source }}</span>
              <span class="muted mono">{{ fmtTime(f.timestamp) }}</span>
            </div>
            <div class="frag-row-body">{{ f.content.slice(0, 80) }}{{ f.content.length > 80 ? '…' : '' }}</div>
            <div class="frag-row-foot">
              <span class="muted">v {{ f.valence.toFixed(2) }}</span>
              <span class="muted">a {{ f.arousal.toFixed(2) }}</span>
              <span class="muted">s {{ f.salience.toFixed(2) }}</span>
            </div>
          </li>
        </ul>
        <div class="empty muted" v-else>暂无 Fragment。</div>
      </section>

      <!-- Traces column -->
      <section class="card list-card">
        <div class="list-header">
          <h2 class="card-title">Trace</h2>
          <div class="filters">
            <select v-model="traceRole" @change="reloadTraces" class="filter-select">
              <option v-for="r in ROLES" :key="r" :value="r">{{ r || '全部角色' }}</option>
            </select>
            <select v-model="traceSort" @change="reloadTraces" class="filter-select">
              <option value="importance">重要性</option>
              <option value="recency">最近</option>
              <option value="relevance">相关度</option>
            </select>
          </div>
        </div>
        <ul class="trace-list" v-if="traces.length">
          <li
            v-for="t in traces.slice(0, 50)"
            :key="t.id"
            class="trace-row"
            :class="{ selected: selectedTraceId === t.id }"
            @click="selectTrace(t.id)"
          >
            <div class="trace-row-head">
              <span class="tag" :class="`role-${t.narrative_role}`">{{ t.narrative_role }}</span>
              <span class="muted mono">{{ t.fragment_ids.length }} frags</span>
            </div>
            <div class="trace-row-body">{{ t.content.slice(0, 80) }}{{ t.content.length > 80 ? '…' : '' }}</div>
            <div class="trace-row-foot">
              <span class="muted">imp {{ t.importance.toFixed(2) }}</span>
              <span class="muted">rec {{ t.recency.toFixed(2) }}</span>
              <span class="muted">rel {{ t.relevance.toFixed(2) }}</span>
              <span class="muted">emo {{ t.emotional_weight.toFixed(2) }}</span>
            </div>
          </li>
        </ul>
        <div class="empty muted" v-else>暂无 Trace。</div>
      </section>

      <!-- Graph + detail column -->
      <section class="graph-col">
        <div class="card graph-card">
          <div class="graph-card-head">
            <h2 class="card-title">关联图（前 80 节点）</h2>
            <button
              class="btn-export"
              @click="exportGraphPng"
              :disabled="!graphNodes.length"
              title="导出关联图为 PNG"
            >导出 PNG</button>
          </div>
          <svg
            ref="graphSvg"
            :viewBox="`0 0 ${GRAPH_W} ${GRAPH_H}`"
            class="graph"
            v-if="graphNodes.length"
            :width="GRAPH_W"
            :height="GRAPH_H"
          >
            <g class="edges">
              <line
                v-for="(e, i) in graphEdges"
                :key="`e-${i}`"
                :x1="e.x1"
                :y1="e.y1"
                :x2="e.x2"
                :y2="e.y2"
                :stroke-width="Math.max(0.5, Math.min(3, e.weight * 0.3))"
                class="edge-line"
              />
            </g>
            <g class="nodes">
              <circle
                v-for="n in graphNodes"
                :key="n.id"
                :cx="n.x"
                :cy="n.y"
                :r="n.type === 'trace' ? 6 : 4"
                :class="['node-circle', `type-${n.type}`]"
                @click="selectGraphNode(n.id)"
              />
              <text
                v-for="n in graphNodes"
                :key="`l-${n.id}`"
                :x="n.x + 8"
                :y="n.y + 3"
                class="node-label"
                v-show="graphNodes.length <= 30"
              >{{ n.label.slice(0, 12) }}</text>
            </g>
          </svg>
          <div class="empty muted" v-else>暂无图谱数据。</div>
          <div class="graph-legend">
            <span class="legend-item"><i class="dot type-fragment" />Fragment</span>
            <span class="legend-item"><i class="dot type-trace" />Trace</span>
          </div>
        </div>

        <div class="card detail-card" v-if="selectedFragment">
          <h2 class="card-title">Fragment 详情</h2>
          <dl class="kv-list">
            <div class="kv-row"><dt>id</dt><dd class="mono">{{ selectedFragment.id }}</dd></div>
            <div class="kv-row"><dt>source</dt><dd><span class="tag" :class="`source-${selectedFragment.source}`">{{ selectedFragment.source }}</span></dd></div>
            <div class="kv-row"><dt>modality</dt><dd>{{ selectedFragment.modality }}</dd></div>
            <div class="kv-row"><dt>timestamp</dt><dd class="mono">{{ fmtTime(selectedFragment.timestamp) }}</dd></div>
            <div class="kv-row"><dt>valence</dt><dd class="mono">{{ selectedFragment.valence.toFixed(3) }}</dd></div>
            <div class="kv-row"><dt>arousal</dt><dd class="mono">{{ selectedFragment.arousal.toFixed(3) }}</dd></div>
            <div class="kv-row"><dt>salience</dt><dd class="mono">{{ selectedFragment.salience.toFixed(3) }}</dd></div>
            <div class="kv-row"><dt>tags</dt><dd><span class="tag" v-for="t in selectedFragment.tags" :key="t">{{ t }}</span></dd></div>
          </dl>
          <p class="detail-content">{{ selectedFragment.content }}</p>
        </div>

        <div class="card detail-card" v-else-if="selectedTrace">
          <h2 class="card-title">Trace 详情</h2>
          <dl class="kv-list">
            <div class="kv-row"><dt>id</dt><dd class="mono">{{ selectedTrace.id }}</dd></div>
            <div class="kv-row"><dt>role</dt><dd><span class="tag" :class="`role-${selectedTrace.narrative_role}`">{{ selectedTrace.narrative_role }}</span></dd></div>
            <div class="kv-row"><dt>fragments</dt><dd class="mono">{{ selectedTrace.fragment_ids.length }}</dd></div>
            <div class="kv-row"><dt>importance</dt><dd class="mono">{{ selectedTrace.importance.toFixed(3) }}</dd></div>
            <div class="kv-row"><dt>recency</dt><dd class="mono">{{ selectedTrace.recency.toFixed(3) }}</dd></div>
            <div class="kv-row"><dt>relevance</dt><dd class="mono">{{ selectedTrace.relevance.toFixed(3) }}</dd></div>
            <div class="kv-row"><dt>emotional</dt><dd class="mono">{{ selectedTrace.emotional_weight.toFixed(3) }}</dd></div>
            <div class="kv-row"><dt>tags</dt><dd><span class="tag" v-for="t in selectedTrace.tags" :key="t">{{ t }}</span></dd></div>
          </dl>
          <p class="detail-content">{{ selectedTrace.content }}</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.memory-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-header {
  padding: 4px 0;
}

.view-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.view-subtitle {
  color: var(--text-muted);
  font-size: 13px;
  margin-top: 4px;
}

.memory-layout {
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr;
  gap: 16px;
  align-items: start;
}

.list-card {
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.filters {
  display: flex;
  gap: 6px;
}

.filter-select {
  background: var(--bg-3);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  font-family: inherit;
}

.frag-list,
.trace-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.frag-row,
.trace-row {
  background: var(--bg-2);
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: border-color 0.15s var(--ease-out), background 0.15s var(--ease-out);
}

.frag-row:hover,
.trace-row:hover {
  background: var(--bg-3);
}

.frag-row.selected,
.trace-row.selected {
  border-color: var(--cen);
  background: var(--cen-soft);
}

.frag-row-head,
.trace-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 10px;
}

.frag-row-body,
.trace-row-body {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.4;
  margin-bottom: 4px;
}

.frag-row-foot,
.trace-row-foot {
  display: flex;
  gap: 8px;
  font-size: 10px;
  flex-wrap: wrap;
}

.graph-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.graph-card {
  padding: 12px;
}

.graph-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.btn-export {
  padding: 4px 12px;
  font-size: 11px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s var(--ease-out);
}

.btn-export:hover:not(:disabled) {
  background: var(--bg-3);
  color: var(--text-primary);
  border-color: var(--sn);
}

.btn-export:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.graph {
  width: 100%;
  height: auto;
  max-height: 480px;
  background: var(--bg-2);
  border-radius: 6px;
}

.edge-line {
  stroke: var(--border);
  opacity: 0.4;
}

.node-circle {
  cursor: pointer;
  transition: r 0.15s var(--ease-out);
}

.node-circle:hover {
  r: 8;
}

.node-circle.type-fragment {
  fill: var(--dmn);
}
.node-circle.type-trace {
  fill: var(--cen);
}

.node-label {
  fill: var(--text-muted);
  font-size: 9px;
  pointer-events: none;
}

.graph-legend {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.type-fragment { background: var(--dmn); }
.dot.type-trace { background: var(--cen); }

.detail-card {
  font-size: 12px;
}

.kv-list {
  margin: 0 0 12px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kv-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 8px;
  align-items: flex-start;
}

.kv-row dt {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.kv-row dd {
  margin: 0;
  color: var(--text-primary);
  font-size: 12px;
}

.detail-content {
  margin: 0;
  padding: 10px;
  background: var(--bg-2);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
}

.empty {
  padding: 20px 0;
  text-align: center;
  font-size: 12px;
}

.muted { color: var(--text-muted); }
.mono { font-family: var(--font-mono); font-feature-settings: 'tnum'; }

.source-personal { background: var(--dmn-soft); color: var(--dmn); border-color: var(--dmn); }
.source-social { background: var(--sn-soft); color: var(--sn); border-color: var(--sn); }
.source-dream { background: rgba(58, 76, 130, 0.24); color: #aab7e6; }
.source-novel { background: rgba(248, 113, 113, 0.18); color: #f0a0a0; }
.source-dmn { background: var(--dmn-soft); color: var(--dmn); border-color: var(--dmn); }
.source-cen { background: var(--cen-soft); color: var(--cen); border-color: var(--cen); }
.source-sandbox { background: var(--cen-soft); color: var(--cen); border-color: var(--cen); }
.source-memory { background: var(--bg-3); color: var(--text-secondary); }

.role-setting { background: var(--dmn-soft); color: var(--dmn); border-color: var(--dmn); }
.role-character { background: var(--sn-soft); color: var(--sn); border-color: var(--sn); }
.role-event { background: var(--cen-soft); color: var(--cen); border-color: var(--cen); }
.role-theme { background: rgba(248, 113, 113, 0.18); color: #f0a0a0; }
.role-mood { background: rgba(58, 76, 130, 0.24); color: #aab7e6; }
</style>
