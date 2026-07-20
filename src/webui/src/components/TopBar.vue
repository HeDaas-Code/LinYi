<script setup lang="ts">
import { computed } from 'vue'
import { useAgentStore } from '@/stores/agent'

// TopBar shows phase + hour + energy bar + mood + alert count, fed by the
// /api/networks/state endpoint (with WS patches via the snapshot composable).

defineProps<{
  title: string
}>()

const store = useAgentStore()

const phase = computed(() => store.phase || '—')
const hour = computed(() => store.hour)
const energy = computed(() => store.energy)
const alertCount = computed(() => store.alertCount)

const hourLabel = computed(() => {
  const h = Math.floor(hour.value)
  const m = Math.floor((hour.value - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

const energyPct = computed(() => {
  const v = Math.max(0, Math.min(100, energy.value))
  return `${v.toFixed(0)}%`
})

const energyBarWidth = computed(() => energyPct.value)

const energyTone = computed(() => {
  if (energy.value < 20) return 'low'
  if (energy.value < 50) return 'mid'
  return 'high'
})

const phaseClass = computed(() => `phase-${phase.value}`)

const moodLabel = computed(() => {
  const m = store.mood
  if (!m) return null
  // Mood may be {valence, arousal, dominance} (baseline_mood shape) or any
  // other dict. We surface a compact summary when possible.
  if (typeof m.valence === 'number' && typeof m.arousal === 'number') {
    const v = m.valence
    const a = m.arousal
    let tone = '中性'
    if (v > 0.3 && a > 0.3) tone = '兴奋'
    else if (v > 0.3 && a <= 0.3) tone = '愉悦'
    else if (v <= -0.3 && a > 0.3) tone = '焦虑'
    else if (v <= -0.3 && a <= 0.3) tone = '低落'
    return tone
  }
  return null
})

const alertTone = computed(() => {
  if (alertCount.value === 0) return 'ok'
  if (alertCount.value < 3) return 'warn'
  return 'error'
})
</script>

<template>
  <header class="app-topbar">
    <div class="topbar-title">{{ title }}</div>

    <div class="topbar-divider" />

    <div class="metric phase-metric">
      <span class="metric-label">阶段</span>
      <span class="phase-pill" :class="phaseClass">{{ phase }}</span>
    </div>

    <div class="metric">
      <span class="metric-label">时间</span>
      <span class="metric-value mono">{{ hourLabel }}</span>
    </div>

    <div class="metric energy-metric">
      <span class="metric-label">能量</span>
      <div class="energy-bar">
        <div class="energy-fill" :class="`tone-${energyTone}`" :style="{ width: energyBarWidth }" />
      </div>
      <span class="metric-value mono">{{ energyPct }}</span>
    </div>

    <div class="metric" v-if="moodLabel">
      <span class="metric-label">情绪</span>
      <span class="metric-value">{{ moodLabel }}</span>
    </div>

    <div class="spacer" />

    <div class="metric alert-metric" :class="`tone-${alertTone}`">
      <span class="alert-dot" />
      <span class="metric-value">{{ alertCount }} 警报</span>
    </div>

    <div class="metric" v-if="store.lastError">
      <span class="metric-label error-text" :title="store.lastError">⚠</span>
    </div>
  </header>
</template>

<style scoped>
.topbar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.topbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border-soft);
}

.metric {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.metric-label {
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
}

.metric-value {
  color: var(--text-primary);
  font-size: 13px;
}

.metric-value.mono {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
}

.phase-pill {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid transparent;
}

.energy-metric {
  min-width: 180px;
}

.energy-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-3);
  border-radius: 3px;
  overflow: hidden;
  min-width: 60px;
  max-width: 120px;
}

.energy-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s var(--ease-out), background 0.3s var(--ease-out);
}

.energy-fill.tone-high {
  background: linear-gradient(90deg, var(--ok), #6ee7a8);
}
.energy-fill.tone-mid {
  background: linear-gradient(90deg, var(--warn), #fde047);
}
.energy-fill.tone-low {
  background: linear-gradient(90deg, var(--error), #fda4af);
}

.spacer {
  flex: 1;
}

.alert-metric {
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
}

.alert-metric.tone-ok {
  color: var(--text-secondary);
}
.alert-metric.tone-warn {
  background: rgba(250, 204, 21, 0.12);
  border-color: var(--warn);
  color: var(--warn);
}
.alert-metric.tone-error {
  background: rgba(248, 113, 113, 0.14);
  border-color: var(--error);
  color: var(--error);
}

.alert-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.error-text {
  color: var(--error);
  cursor: help;
}
</style>
