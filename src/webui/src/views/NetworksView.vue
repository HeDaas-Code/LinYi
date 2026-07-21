<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { NetworkModuleState } from '@/types'

// NetworksView (网络状态) — Phase 2.
//
// Shows SN / DMN / CEN state side-by-side, plus a network-switch event log
// pulled from /api/bus/events (filtered by control.network.switch).
// Each network card surfaces the most relevant fields from its to_dict()
// output. Phase 3 will swap the static layout for an animated brain SVG.

const store = useAgentStore()

const sn = computed<NetworkModuleState>(
  () => (store.networks?.networks.sn as NetworkModuleState) ?? {},
)
const dmn = computed<NetworkModuleState>(
  () => (store.networks?.networks.dmn as NetworkModuleState) ?? {},
)
const cen = computed<NetworkModuleState>(
  () => (store.networks?.networks.cen as NetworkModuleState) ?? {},
)

const phase = computed(() => store.networks?.phase ?? '—')
const hour = computed(() => store.networks?.hour ?? 0)
const energy = computed(() => store.networks?.energy ?? 0)
const alertCount = computed(() => store.networks?.alert_count ?? 0)

const hourLabel = computed(() => {
  const h = Math.floor(hour.value)
  const m = Math.floor((hour.value - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

// Active network is CEN when last_network == 'cen', otherwise DMN. SN is
// always on (it's the router) but we highlight whichever it most recently
// routed to.
const activeNetwork = computed<string>(() => {
  const last = sn.value.last_network
  if (last === 'cen') return 'cen'
  return 'dmn'
})

function fmtFloat(v: unknown, digits = 2): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  if (!isFinite(n)) return '—'
  return n.toFixed(digits)
}

function activationPct(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  if (!isFinite(n) || n <= 0) return '0%'
  // activation_level is 0-1; energy is 0-100. Normalize.
  const pct = n <= 1 ? n * 100 : n
  return `${Math.max(0, Math.min(100, pct)).toFixed(0)}%`
}

function activationWidth(v: unknown): string {
  return activationPct(v)
}

interface NetworkCard {
  id: string
  name: string
  full: string
  tone: 'sn' | 'dmn' | 'cen'
  state: NetworkModuleState
  active: boolean
}

const cards = computed<NetworkCard[]>(() => [
  {
    id: 'sn',
    name: 'SN',
    full: 'Salience Network · 显著性网络',
    tone: 'sn',
    state: sn.value,
    active: true,
  },
  {
    id: 'dmn',
    name: 'DMN',
    full: 'Default Mode Network · 默认模式网络',
    tone: 'dmn',
    state: dmn.value,
    active: activeNetwork.value === 'dmn',
  },
  {
    id: 'cen',
    name: 'CEN',
    full: 'Central Executive Network · 中央执行网络',
    tone: 'cen',
    state: cen.value,
    active: activeNetwork.value === 'cen',
  },
])

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!store.networks) {
    store.fetchNetworks()
  }
  // Refresh every 5s — networks state changes slowly.
  pollTimer = setInterval(() => store.fetchNetworks(), 5000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="networks-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">网络状态</h1>
        <div class="view-subtitle">
          阶段 <span class="phase-pill" :class="`phase-${phase}`">{{ phase }}</span>
          · 时间 <span class="mono">{{ hourLabel }}</span>
          · 能量 <span class="mono">{{ energy.toFixed(0) }}</span>
          · 警报 <span :class="{ 'alert-text': alertCount > 0 }">{{ alertCount }}</span>
        </div>
      </div>
    </header>

    <div class="cards-grid">
      <section v-for="card in cards" :key="card.id" class="card net-card" :class="[`tone-${card.tone}`, { active: card.active }]">
        <div class="net-card-header">
          <div>
            <div class="net-name">{{ card.name }}</div>
            <div class="net-full">{{ card.full }}</div>
          </div>
          <div class="active-dot" v-if="card.active" :class="`tone-${card.tone}`">活跃</div>
        </div>

        <!-- Network-specific panels -->
        <div v-if="card.id === 'sn'" class="net-body">
          <div class="kv-row"><span class="metric-label">能量</span><span class="mono">{{ fmtFloat(card.state.energy) }}</span></div>
          <div class="kv-row"><span class="metric-label">阶段</span><span>{{ card.state.phase || '—' }}</span></div>
          <div class="kv-row"><span class="metric-label">最近路由</span><span class="mono">{{ card.state.last_network?.toUpperCase() || '—' }}</span></div>
          <div class="kv-row"><span class="metric-label">评估次数</span><span class="mono">{{ card.state.evaluation_count ?? 0 }}</span></div>
          <div class="kv-row"><span class="metric-label">切换次数</span><span class="mono">{{ card.state.switch_count ?? 0 }}</span></div>
          <div class="kv-row"><span class="metric-label">拒绝触发</span><span class="mono">{{ card.state.rejected_count ?? 0 }}</span></div>
        </div>

        <div v-else-if="card.id === 'dmn'" class="net-body">
          <div class="kv-row">
            <span class="metric-label">激活水平</span>
            <div class="bar-row">
              <div class="bar"><div class="bar-fill" :class="`tone-${card.tone}`" :style="{ width: activationWidth(card.state.activation_level) }" /></div>
              <span class="mono">{{ activationPct(card.state.activation_level) }}</span>
            </div>
          </div>
          <div class="kv-row"><span class="metric-label">当前主题</span><span>{{ card.state.current_theme || '—' }}</span></div>
          <div class="kv-row"><span class="metric-label">游荡 Trace</span><span class="mono">{{ card.state.wandering_traces?.length ?? card.state.wandering_trace_count ?? 0 }}</span></div>
          <div class="kv-row"><span class="metric-label">梦境队列</span><span class="mono">{{ card.state.dream_queue?.length ?? card.state.dream_queue_count ?? 0 }}</span></div>
          <div class="kv-row"><span class="metric-label">反思缓冲</span><span class="mono">{{ card.state.reflection_buffer?.length ?? card.state.reflection_buffer_count ?? 0 }}</span></div>
          <div class="kv-row"><span class="metric-label">最后阶段</span><span>{{ card.state.last_phase || '—' }}</span></div>
        </div>

        <div v-else-if="card.id === 'cen'" class="net-body">
          <div class="kv-row">
            <span class="metric-label">执行负载</span>
            <div class="bar-row">
              <div class="bar"><div class="bar-fill" :class="`tone-${card.tone}`" :style="{ width: activationWidth(card.state.executive_load) }" /></div>
              <span class="mono">{{ activationPct(card.state.executive_load) }}</span>
            </div>
          </div>
          <div class="kv-row"><span class="metric-label">当前任务</span><span>{{ card.state.current_task || '—' }}</span></div>
          <div class="kv-row"><span class="metric-label">当前目标</span><span>{{ (card.state.current_goal as any)?.name ?? '—' }}</span></div>
          <div class="kv-row"><span class="metric-label">工作记忆</span><span class="mono">{{ card.state.working_memory?.length ?? card.state.working_memory_count ?? 0 }}</span></div>
          <div class="kv-row"><span class="metric-label">目标栈</span><span class="mono">{{ card.state.goal_stack?.length ?? 0 }}</span></div>
          <div class="kv-row">
            <span class="metric-label">沙盘状态</span>
            <span class="status-row">
              <span class="status-pill" :class="{ on: card.state.sandbox_built }">built</span>
              <span class="status-pill" :class="{ on: card.state.awaiting_ready }">await</span>
              <span class="status-pill" :class="{ on: card.state.narrative_ready }">ready</span>
            </span>
          </div>
          <div class="kv-row" v-if="card.state.ab_in_progress">
            <span class="metric-label">A/B 分叉</span>
            <span class="mono">{{ card.state.ab_versions?.length ?? 0 }} 版本 · 剩余 {{ card.state.ab_rounds_remaining ?? 0 }} 轮</span>
          </div>
        </div>
      </section>
    </div>

    <!-- CEN goal stack detail -->
    <section class="card" v-if="cen.goal_stack?.length">
      <h2 class="card-title">目标栈 · CEN</h2>
      <ol class="goal-stack">
        <li v-for="(g, i) in cen.goal_stack" :key="i" class="goal-item">
          <span class="goal-idx mono">{{ i + 1 }}</span>
          <span class="goal-name">{{ (g as any).name ?? '—' }}</span>
          <span class="tag" :class="`goal-type-${(g as any).goal_type}`">{{ (g as any).goal_type }}</span>
          <span class="tag" v-if="(g as any).status">{{ (g as any).status }}</span>
          <span class="goal-priority mono" v-if="typeof (g as any).priority === 'number'">P{{ (g as any).priority }}</span>
        </li>
      </ol>
    </section>

    <!-- CEN working memory detail -->
    <section class="card" v-if="cen.working_memory?.length">
      <h2 class="card-title">工作记忆 · CEN</h2>
      <ul class="frag-list">
        <li v-for="f in cen.working_memory.slice(0, 10)" :key="f.id" class="frag-item">
          <div class="frag-meta">
            <span class="tag" :class="`source-${f.source}`">{{ f.source }}</span>
            <span class="mono muted">{{ new Date(f.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
            <span class="muted">salience {{ f.salience.toFixed(2) }}</span>
          </div>
          <div class="frag-content">{{ f.content }}</div>
        </li>
      </ul>
    </section>

    <!-- DMN reflection + dream snapshot -->
    <section class="card" v-if="dmn.reflection_buffer?.length || dmn.dream_queue?.length">
      <h2 class="card-title">DMN 缓冲快照</h2>
      <div class="dmn-buffers">
        <div class="dmn-buffer" v-if="dmn.reflection_buffer?.length">
          <h3 class="buffer-label">反思缓冲（{{ dmn.reflection_buffer.length }}）</h3>
          <ul class="frag-list compact">
            <li v-for="f in dmn.reflection_buffer.slice(-5).reverse()" :key="f.id" class="frag-item">
              <div class="frag-meta">
                <span class="mono muted">{{ new Date(f.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
                <span class="muted">v {{ f.valence.toFixed(2) }}</span>
              </div>
              <div class="frag-content">{{ f.content }}</div>
            </li>
          </ul>
        </div>
        <div class="dmn-buffer" v-if="dmn.dream_queue?.length">
          <h3 class="buffer-label">梦境队列（{{ dmn.dream_queue.length }}）</h3>
          <ul class="frag-list compact">
            <li v-for="f in dmn.dream_queue.slice(-5).reverse()" :key="f.id" class="frag-item">
              <div class="frag-meta">
                <span class="mono muted">{{ new Date(f.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
                <span class="muted">salience {{ f.salience.toFixed(2) }}</span>
              </div>
              <div class="frag-content">{{ f.content }}</div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.networks-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
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
  color: var(--text-secondary);
  font-size: 13px;
  margin-top: 6px;
}

.mono {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
  color: var(--text-primary);
}

.muted {
  color: var(--text-muted);
}

.alert-text {
  color: var(--warn);
  font-weight: 600;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.net-card {
  border-top: 3px solid var(--border-soft);
  position: relative;
}

.net-card.tone-sn {
  border-top-color: var(--sn);
}
.net-card.tone-dmn {
  border-top-color: var(--dmn);
}
.net-card.tone-cen {
  border-top-color: var(--cen);
}

.net-card.active::after {
  content: '';
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 6px var(--ok);
}

.net-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.net-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.net-card.tone-sn .net-name { color: var(--sn); }
.net-card.tone-dmn .net-name { color: var(--dmn); }
.net-card.tone-cen .net-name { color: var(--cen); }

.net-full {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.active-dot {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  background: var(--bg-3);
}

.active-dot.tone-sn { background: var(--sn-soft); color: var(--sn); }
.active-dot.tone-dmn { background: var(--dmn-soft); color: var(--dmn); }
.active-dot.tone-cen { background: var(--cen-soft); color: var(--cen); }

.net-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.metric-label {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar {
  flex: 1;
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  transition: width 0.4s var(--ease-out);
}

.bar-fill.tone-sn { background: var(--sn); }
.bar-fill.tone-dmn { background: var(--dmn); }
.bar-fill.tone-cen { background: var(--cen); }

.status-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.status-pill {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  background: var(--bg-3);
  color: var(--text-muted);
  border: 1px solid var(--border-soft);
}

.status-pill.on {
  background: var(--cen-soft);
  color: var(--cen);
  border-color: var(--cen);
}

.goal-stack {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.goal-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-2);
  border-radius: 6px;
  font-size: 13px;
}

.goal-idx {
  font-weight: 600;
  color: var(--text-muted);
  width: 24px;
}

.goal-name {
  flex: 1;
  color: var(--text-primary);
}

.goal-priority {
  font-size: 11px;
  color: var(--text-secondary);
}

.goal-type-life {
  background: var(--dmn-soft);
  border-color: var(--dmn);
  color: var(--dmn);
}
.goal-type-daily {
  background: var(--cen-soft);
  border-color: var(--cen);
  color: var(--cen);
}
.goal-type-task {
  background: var(--sn-soft);
  border-color: var(--sn);
  color: var(--sn);
}

.frag-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.frag-list.compact {
  gap: 6px;
}

.frag-item {
  background: var(--bg-2);
  border-radius: 6px;
  padding: 8px 12px;
  border-left: 2px solid var(--border);
}

.frag-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 10px;
  margin-bottom: 4px;
}

.frag-content {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}

.source-personal { background: var(--dmn-soft); color: var(--dmn); border-color: var(--dmn); }
.source-social { background: var(--sn-soft); color: var(--sn); border-color: var(--sn); }
.source-dream { background: rgba(58, 76, 130, 0.24); color: #aab7e6; }
.source-novel { background: rgba(248, 113, 113, 0.18); color: #f0a0a0; }
.source-dmn { background: var(--dmn-soft); color: var(--dmn); border-color: var(--dmn); }
.source-cen { background: var(--cen-soft); color: var(--cen); border-color: var(--cen); }
.source-sandbox { background: var(--cen-soft); color: var(--cen); border-color: var(--cen); }
.source-memory { background: var(--bg-3); color: var(--text-secondary); }

.dmn-buffers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.buffer-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}
</style>
