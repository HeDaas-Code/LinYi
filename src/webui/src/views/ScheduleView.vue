<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { SchedulePhase } from '@/types'

// ScheduleView (日程节律) — Phase 1 gantt + energy curve overlay.
//
// Layout from docs/WEBUI-REFACTOR.md §4.3 Phase 1:
//   - Top: 24-hour horizontal gantt of today's phases, with a "now" cursor
//   - Bottom: energy history curve (from metabolism._energy_history) overlaid
//     on the same axis, so the user can see how energy tracks phase changes.
//
// Phase 1 uses inline SVG; Phase 2 will swap to D3 for axes + tooltips.

const store = useAgentStore()

const schedule = computed(() => store.schedule)
const phases = computed<SchedulePhase[]>(() => store.schedule?.schedule.phases ?? [])
const fallback = computed(() => store.schedule?.schedule.fallback ?? false)
const currentPhaseInfo = computed(() => store.schedule?.schedule.current_phase_info ?? null)
const clock = computed(() => store.schedule?.clock)
const energyHistory = computed<number[]>(() => store.schedule?.energy_history ?? [])

const HOUR_PX = 50 // 1 hour = 50px → 24h = 1200px wide
const GANTT_HEIGHT = 56
const ENERGY_HEIGHT = 140

const ganttWidth = computed(() => 24 * HOUR_PX)

const hourMarks = computed(() => {
  const marks = []
  for (let h = 0; h <= 24; h += 2) {
    marks.push({
      hour: h,
      x: h * HOUR_PX,
      label: `${String(h % 24).padStart(2, '0')}:00`,
    })
  }
  return marks
})

interface PhaseBar {
  phase: SchedulePhase
  x: number
  width: number
  tone: string
}

function networkTone(p: SchedulePhase): string {
  switch (p.preferred_network) {
    case 'sn':
      return 'sn'
    case 'cen':
      return 'cen'
    case 'dmn':
    default:
      return 'dmn'
  }
}

const phaseBars = computed<PhaseBar[]>(() => {
  return phases.value.map((p) => {
    let start = p.planned_start_minutes
    let end = p.planned_end_minutes
    if (end <= start) end += 24 * 60
    return {
      phase: p,
      x: (start / 60) * HOUR_PX,
      width: ((end - start) / 60) * HOUR_PX,
      tone: networkTone(p),
    }
  })
})

const nowX = computed(() => {
  const h = clock.value?.hour ?? 0
  return h * HOUR_PX
})

const energyPoints = computed(() => {
  const history = energyHistory.value
  if (history.length === 0) return ''
  // Map energy history onto the gantt axis. The history is sampled at
  // arbitrary times; we spread the points evenly across the visible window
  // so the curve shape is informative even without exact timestamps.
  const n = history.length
  const w = ganttWidth.value
  const maxE = Math.max(100, ...history)
  return history
    .map((e, i) => {
      const x = n === 1 ? 0 : (i / (n - 1)) * w
      const y = ENERGY_HEIGHT - (Math.max(0, Math.min(maxE, e)) / maxE) * (ENERGY_HEIGHT - 20) - 10
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
})

const currentEnergy = computed(() => clock.value?.energy ?? null)

const phaseLabel = (p: SchedulePhase): string => {
  const map: Record<string, string> = {
    deep_night: '深睡',
    morning: '晨起',
    incubation: '孵化',
    social: '社交',
    simulation: '模拟',
    reflection: '反思',
    creation: '创作',
  }
  return map[p.phase_type] ?? p.phase_type
}

const clockHourLabel = computed(() => {
  const h = clock.value?.hour
  if (typeof h !== 'number') return '—'
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
})

onMounted(() => {
  if (!store.schedule) {
    store.fetchSchedule()
  }
})
</script>

<template>
  <div class="schedule-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">日程节律</h1>
        <div class="view-subtitle">
          {{ schedule?.schedule.date ?? '今日' }}
          <span class="badge" v-if="fallback">fallback 模式</span>
        </div>
      </div>
      <div class="clock-summary">
        <div class="clock-row">
          <span class="metric-label">当前时间</span>
          <span class="mono">{{ clockHourLabel }}</span>
        </div>
        <div class="clock-row">
          <span class="metric-label">阶段</span>
          <span class="phase-pill" :class="`phase-${clock?.phase}`">{{ clock?.phase ?? '—' }}</span>
        </div>
        <div class="clock-row" v-if="currentEnergy !== null">
          <span class="metric-label">能量</span>
          <span class="mono">{{ currentEnergy.toFixed(1) }}</span>
        </div>
        <div class="clock-row">
          <span class="metric-label">Tick</span>
          <span class="mono">{{ clock?.tick ?? 0 }}</span>
        </div>
      </div>
    </header>

    <!-- Current phase card -->
    <section class="card current-card" v-if="currentPhaseInfo">
      <h2 class="card-title">当前阶段</h2>
      <div class="current-grid">
        <div class="current-cell">
          <span class="metric-label">类型</span>
          <span class="phase-pill" :class="`phase-${currentPhaseInfo.phase_type}`">
            {{ phaseLabel(currentPhaseInfo as any) }}
          </span>
        </div>
        <div class="current-cell">
          <span class="metric-label">计划</span>
          <span class="mono">{{ currentPhaseInfo.planned_start }} – {{ currentPhaseInfo.planned_end }}</span>
        </div>
        <div class="current-cell">
          <span class="metric-label">偏好网络</span>
          <span :class="`network-${currentPhaseInfo.preferred_network}`">
            {{ currentPhaseInfo.preferred_network.toUpperCase() }}
          </span>
        </div>
        <div class="current-cell">
          <span class="metric-label">能量预算</span>
          <span class="mono">{{ currentPhaseInfo.energy_budget.toFixed(1) }}</span>
        </div>
      </div>
    </section>

    <!-- Gantt -->
    <section class="card">
      <h2 class="card-title">今日时段（24 小时甘特图）</h2>
      <div class="gantt-scroll">
        <svg
          :width="ganttWidth"
          :height="GANTT_HEIGHT + 24"
          class="gantt"
          v-if="phases.length"
        >
          <!-- Hour grid -->
          <g class="hour-grid">
            <line
              v-for="m in hourMarks"
              :key="`g-${m.hour}`"
              :x1="m.x"
              :x2="m.x"
              :y1="0"
              :y2="GANTT_HEIGHT"
              class="grid-line"
            />
            <text
              v-for="m in hourMarks"
              :key="`t-${m.hour}`"
              :x="m.x + 4"
              :y="GANTT_HEIGHT + 16"
              class="hour-label"
            >{{ m.label }}</text>
          </g>

          <!-- Phase bars -->
          <g class="phase-bars">
            <rect
              v-for="(b, i) in phaseBars"
              :key="`bar-${i}`"
              :x="b.x + 1"
              :y="8"
              :width="Math.max(2, b.width - 2)"
              :height="GANTT_HEIGHT - 16"
              :class="`bar tone-${b.tone}`"
              :rx="4"
            />
            <text
              v-for="(b, i) in phaseBars"
              :key="`lbl-${i}`"
              :x="b.x + b.width / 2"
              :y="GANTT_HEIGHT / 2 + 4"
              text-anchor="middle"
              class="bar-label"
              v-show="b.width > 60"
            >{{ phaseLabel(b.phase) }}</text>
          </g>

          <!-- Now cursor -->
          <line
            :x1="nowX"
            :x2="nowX"
            :y1="0"
            :y2="GANTT_HEIGHT"
            class="now-line"
          />
          <text :x="nowX + 4" :y="14" class="now-label">现在</text>
        </svg>
        <div class="empty muted" v-else>暂无日程数据。</div>
      </div>

      <!-- Network legend -->
      <div class="legend">
        <span class="legend-item"><i class="dot tone-dmn" />DMN</span>
        <span class="legend-item"><i class="dot tone-sn" />SN</span>
        <span class="legend-item"><i class="dot tone-cen" />CEN</span>
      </div>
    </section>

    <!-- Energy curve -->
    <section class="card">
      <h2 class="card-title">能量曲线</h2>
      <div class="gantt-scroll">
        <svg
          :width="ganttWidth"
          :height="ENERGY_HEIGHT + 24"
          class="energy-chart"
          v-if="energyPoints"
        >
          <line
            v-for="m in hourMarks"
            :key="`eg-${m.hour}`"
            :x1="m.x"
            :x2="m.x"
            :y1="0"
            :y2="ENERGY_HEIGHT"
            class="grid-line"
          />
          <polyline :points="energyPoints" class="energy-line" fill="none" />
          <line
            :x1="nowX"
            :x2="nowX"
            :y1="0"
            :y2="ENERGY_HEIGHT"
            class="now-line"
          />
          <text
            v-for="m in hourMarks"
            :key="`et-${m.hour}`"
            :x="m.x + 4"
            :y="ENERGY_HEIGHT + 16"
            class="hour-label"
          >{{ m.label }}</text>
        </svg>
        <div class="empty muted" v-else>
          暂无能量历史。运行一段时间后此曲线会自动出现。
        </div>
      </div>
    </section>

    <!-- Phase breakdown table -->
    <section class="card">
      <h2 class="card-title">阶段明细</h2>
      <table class="phase-table" v-if="phases.length">
        <thead>
          <tr>
            <th>阶段</th>
            <th>计划时段</th>
            <th>时长（分钟）</th>
            <th>能量预算</th>
            <th>偏好网络</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in phases" :key="p.id" :class="{ current: currentPhaseInfo?.id === p.id }">
            <td>
              <span class="phase-pill" :class="`phase-${p.phase_type}`">{{ phaseLabel(p) }}</span>
            </td>
            <td class="mono">{{ p.planned_start }} – {{ p.planned_end }}</td>
            <td class="mono">{{ p.planned_duration_minutes }}</td>
            <td class="mono">{{ p.energy_budget.toFixed(1) }}</td>
            <td :class="`network-${p.preferred_network}`">{{ p.preferred_network.toUpperCase() }}</td>
          </tr>
        </tbody>
      </table>
      <div class="empty muted" v-else>暂无阶段数据。</div>
    </section>
  </div>
</template>

<style scoped>
.schedule-view {
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
  gap: 24px;
  flex-wrap: wrap;
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

.badge {
  display: inline-block;
  padding: 1px 8px;
  margin-left: 8px;
  border-radius: 10px;
  background: rgba(250, 204, 21, 0.16);
  color: var(--warn);
  font-size: 10px;
  border: 1px solid var(--warn);
}

.clock-summary {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.clock-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mono {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
  color: var(--text-primary);
  font-size: 13px;
}

.metric-label {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.phase-pill {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  border: 1px solid transparent;
  display: inline-block;
}

.current-card {
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
}

.current-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.current-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gantt-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}

.gantt,
.energy-chart {
  display: block;
}

.grid-line {
  stroke: var(--border-soft);
  stroke-width: 1;
}

.hour-label {
  fill: var(--text-muted);
  font-size: 10px;
  font-family: var(--font-mono);
}

.bar {
  stroke-width: 1;
}

.bar.tone-dmn {
  fill: var(--dmn-soft);
  stroke: var(--dmn);
}
.bar.tone-sn {
  fill: var(--sn-soft);
  stroke: var(--sn);
}
.bar.tone-cen {
  fill: var(--cen-soft);
  stroke: var(--cen);
}

.bar-label {
  fill: var(--text-primary);
  font-size: 11px;
  font-family: var(--font-sans);
  pointer-events: none;
}

.now-line {
  stroke: var(--text-inverse);
  stroke-width: 1.5;
  stroke-dasharray: 3 3;
  opacity: 0.6;
}

.now-label {
  fill: var(--text-inverse);
  font-size: 10px;
  font-weight: 600;
  opacity: 0.7;
}

.energy-line {
  stroke: var(--ok);
  stroke-width: 2;
  fill: none;
}

.legend {
  display: flex;
  gap: 16px;
  margin-top: 12px;
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

.dot.tone-dmn { background: var(--dmn); }
.dot.tone-sn { background: var(--sn); }
.dot.tone-cen { background: var(--cen); }

.phase-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.phase-table th {
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-soft);
  font-weight: 600;
}

.phase-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-soft);
  color: var(--text-primary);
}

.phase-table tr.current td {
  background: var(--bg-2);
}

.empty {
  padding: 16px 0;
  text-align: center;
}
</style>
