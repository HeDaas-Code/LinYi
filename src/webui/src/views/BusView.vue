<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { BusEvent } from '@/types'

// BusView (总线事件流) — Phase 5.
//
// Live stream of recent bus events captured by the BusSpy. Supports:
//   - Pause/resume auto-refresh
//   - Filter by channel (control / data / llm / ...) and free-text topic search
//   - Per-event payload inspector (collapsed JSON by default)
//   - Severity coloring by priority (P0-P9)
//
// Data source: /api/bus/events?limit=N → router._web_ui_spy.recent(N)

const store = useAgentStore()

const paused = ref(false)
const limit = ref(150)
const channelFilter = ref<string>('')
const topicSearch = ref<string>('')
const expanded = ref<Set<string | number>>(new Set())

const events = computed<BusEvent[]>(() => store.busEvents)

const channels = computed<string[]>(() => {
  const set = new Set<string>()
  for (const e of events.value) {
    if (e.channel) set.add(e.channel)
  }
  return Array.from(set).sort()
})

const filteredEvents = computed<BusEvent[]>(() => {
  let out = events.value
  if (channelFilter.value) {
    out = out.filter((e) => e.channel === channelFilter.value)
  }
  const q = topicSearch.value.trim().toLowerCase()
  if (q) {
    out = out.filter((e) => {
      return (
        e.topic?.toLowerCase().includes(q) ||
        e.source?.toLowerCase().includes(q) ||
        false
      )
    })
  }
  return out
})

function priorityTone(p?: number): string {
  if (p === undefined) return 'p-default'
  if (p <= 2) return 'p-critical'
  if (p <= 5) return 'p-normal'
  return 'p-low'
}

function fmtTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

function payloadSummary(p: unknown): string {
  if (p === null || p === undefined) return '∅'
  if (typeof p !== 'object') return String(p)
  try {
    const s = JSON.stringify(p)
    return s.length > 80 ? s.slice(0, 80) + '…' : s
  } catch {
    return String(p)
  }
}

function payloadJson(p: unknown): string {
  if (p === null || p === undefined) return 'null'
  try {
    return JSON.stringify(p, null, 2)
  } catch {
    return String(p)
  }
}

function toggleExpand(id: string | number | undefined) {
  const key = id ?? Date.now()
  const next = new Set(expanded.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expanded.value = next
}

function isExpanded(id: string | number | undefined): boolean {
  return expanded.value.has(id ?? '')
}

function clearFilter() {
  channelFilter.value = ''
  topicSearch.value = ''
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (!paused.value) store.fetchBusEvents(limit.value)
  }, 3000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(paused, (p) => {
  if (!p) store.fetchBusEvents(limit.value)
})

onMounted(() => {
  store.fetchBusEvents(limit.value)
  startPolling()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<template>
  <div class="bus-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">总线事件流</h1>
        <div class="view-subtitle">
          <span class="muted">事件总数</span>
          <span class="mono">{{ events.length }}</span>
          <span class="sep">·</span>
          <span class="muted">显示</span>
          <span class="mono">{{ filteredEvents.length }}</span>
          <span class="sep">·</span>
          <span :class="['status', paused ? 'status-paused' : 'status-live']">
            {{ paused ? '已暂停' : '实时' }}
          </span>
        </div>
      </div>
      <div class="header-actions">
        <button :class="['btn-toggle', { on: !paused }]" @click="paused = !paused">
          {{ paused ? '▶ 继续' : '⏸ 暂停' }}
        </button>
        <button class="btn-refresh" @click="store.fetchBusEvents(limit.value)">立即刷新</button>
      </div>
    </header>

    <!-- Filter bar -->
    <section class="card filter-bar">
      <div class="filter-group">
        <label class="filter-label">频道</label>
        <select v-model="channelFilter" class="filter-select">
          <option value="">全部 ({{ channels.length }})</option>
          <option v-for="c in channels" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">话题/来源</label>
        <input
          v-model="topicSearch"
          type="text"
          placeholder="搜索 topic 或 source…"
          class="filter-input"
        />
      </div>
      <div class="filter-group">
        <label class="filter-label">数量</label>
        <select v-model.number="limit" class="filter-select narrow" @change="store.fetchBusEvents(limit)">
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="150">150</option>
          <option :value="300">300</option>
        </select>
      </div>
      <button class="btn-clear" @click="clearFilter" v-if="channelFilter || topicSearch">清除</button>
    </section>

    <!-- Event stream -->
    <section class="card stream-card">
      <div v-if="!filteredEvents.length" class="empty">
        <div class="empty-icon">∅</div>
        <p class="empty-text">没有匹配的事件。总线可能尚未产生流量，或筛选条件过严。</p>
      </div>
      <ul v-else class="event-list">
        <li
          v-for="(e, i) in filteredEvents"
          :key="e.id ?? `${e.timestamp}-${i}`"
          :class="['event-row', priorityTone(e.priority)]"
          @click="toggleExpand(e.id ?? `${e.timestamp}-${i}`)"
        >
          <div class="event-main">
            <span class="event-time mono">{{ fmtTime(e.timestamp) }}</span>
            <span class="event-channel tag">{{ e.channel || '—' }}</span>
            <span :class="['event-priority', `pr-${priorityTone(e.priority)}`]">
              P{{ e.priority ?? '-' }}
            </span>
            <span class="event-source mono">{{ e.source || '—' }}</span>
            <span class="event-topic">{{ e.topic || '—' }}</span>
          </div>
          <div class="event-payload">
            <span v-if="!isExpanded(e.id ?? `${e.timestamp}-${i}`)" class="payload-summary mono">
              {{ payloadSummary(e.payload) }}
            </span>
            <pre v-else class="payload-detail mono"><code>{{ payloadJson(e.payload) }}</code></pre>
          </div>
        </li>
      </ul>
    </section>

    <!-- Channel legend -->
    <section class="card legend-card" v-if="channels.length">
      <h2 class="card-title">频道图例</h2>
      <div class="legend-grid">
        <button
          v-for="c in channels"
          :key="c"
          :class="['legend-chip', { active: channelFilter === c }]"
          @click="channelFilter = channelFilter === c ? '' : c"
        >
          <span class="legend-name">{{ c }}</span>
          <span class="legend-count mono">{{ events.filter(e => e.channel === c).length }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bus-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 4px 0;
  flex-wrap: wrap;
  gap: 12px;
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
  display: flex;
  align-items: center;
  gap: 6px;
}

.mono {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
  color: var(--text-primary);
}

.muted {
  color: var(--text-muted);
}

.sep {
  color: var(--text-muted);
  margin: 0 4px;
}

.status {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.status-live {
  background: var(--dmn-soft);
  color: var(--dmn);
}

.status-live::before {
  content: '●';
  margin-right: 4px;
  animation: pulse 1.6s infinite;
}

.status-paused {
  background: var(--bg-3);
  color: var(--text-muted);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn-toggle,
.btn-refresh,
.btn-clear {
  padding: 6px 12px;
  font-size: 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s var(--ease-out);
}

.btn-toggle.on {
  background: var(--dmn-soft);
  border-color: var(--dmn);
  color: var(--dmn);
}

.btn-refresh:hover,
.btn-clear:hover {
  background: var(--bg-3);
  color: var(--text-primary);
}

.filter-bar {
  display: flex;
  gap: 16px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.filter-select,
.filter-input {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.filter-select:focus,
.filter-input:focus {
  border-color: var(--cen);
}

.filter-select.narrow {
  width: 80px;
}

.filter-input {
  width: 240px;
}

.stream-card {
  padding: 0;
  overflow: hidden;
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
}

.event-row {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-soft);
  cursor: pointer;
  transition: background 0.1s var(--ease-out);
  border-left: 3px solid transparent;
}

.event-row:hover {
  background: var(--bg-2);
}

.event-row.p-critical {
  border-left-color: var(--error);
}

.event-row.p-normal {
  border-left-color: var(--cen);
}

.event-row.p-low {
  border-left-color: var(--border);
}

.event-main {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  flex-wrap: wrap;
}

.event-time {
  color: var(--text-muted);
  min-width: 110px;
}

.event-channel {
  background: var(--bg-3);
  color: var(--text-secondary);
}

.event-priority {
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono);
}

.pr-p-critical {
  background: rgba(248, 113, 113, 0.18);
  color: var(--error);
}

.pr-p-normal {
  background: var(--cen-soft);
  color: var(--cen);
}

.pr-p-low {
  background: var(--bg-3);
  color: var(--text-muted);
}

.event-source {
  color: var(--text-secondary);
  min-width: 80px;
}

.event-topic {
  color: var(--text-primary);
  font-weight: 500;
  flex: 1;
  min-width: 200px;
}

.event-payload {
  margin-top: 4px;
  padding-left: 120px;
}

.payload-summary {
  font-size: 11px;
  color: var(--text-muted);
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.payload-detail {
  margin: 0;
  padding: 8px;
  background: var(--bg-0);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  overflow-x: auto;
  max-height: 200px;
}

.payload-detail code {
  font-family: var(--font-mono);
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.empty-text {
  margin: 0;
  font-size: 13px;
}

.legend-card {
  padding: 12px 16px;
}

.legend-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 14px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  transition: all 0.15s var(--ease-out);
}

.legend-chip:hover {
  background: var(--bg-3);
}

.legend-chip.active {
  background: var(--cen-soft);
  border-color: var(--cen);
  color: var(--cen);
}

.legend-count {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
