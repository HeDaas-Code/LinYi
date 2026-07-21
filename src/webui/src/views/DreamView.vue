<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { Fragment } from '@/types'
import { downloadText, timestampSlug } from '@/utils/export'

// DreamView (日记·反思) — Phase 2.
//
// Renders DMN's reflection buffer as a vertical diary timeline, with each
// entry's valence/arousal shown as a colored marker. The header shows a
// mood summary derived from the last 8 reflections (computed by DMN's
// _estimate_mood() and exposed via /api/dmn/reflections).
//
// Phase 3 will add a "past days" archive by querying memory traces with
// tag=reflection via POST /api/memory/query (not yet implemented).
//
// Phase 6: added "导出 Markdown" button to dump the current reflection buffer.

const store = useAgentStore()

const reflections = computed<Fragment[]>(() => store.dmnReflections?.reflections ?? [])
const mood = computed(() => store.dmnReflections?.mood_estimate ?? null)

const count = computed(() => reflections.value.length)

const moodLabel = computed(() => {
  if (!mood.value) return null
  const v = mood.value.valence
  const a = mood.value.arousal
  if (v > 0.3 && a > 0.3) return { text: '兴奋', tone: 'high' }
  if (v > 0.3 && a <= 0.3) return { text: '愉悦', tone: 'positive' }
  if (v <= -0.3 && a > 0.3) return { text: '焦虑', tone: 'anxious' }
  if (v <= -0.3 && a <= 0.3) return { text: '低落', tone: 'low' }
  return { text: '平静', tone: 'neutral' }
})

function fmtTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function fmtDay(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
}

// Group reflections by day for the timeline UI.
interface DayGroup {
  day: string
  items: Fragment[]
}

const dayGroups = computed<DayGroup[]>(() => {
  const groups: DayGroup[] = []
  let current: DayGroup | null = null
  for (const f of reflections.value) {
    const day = fmtDay(f.timestamp)
    if (!current || current.day !== day) {
      current = { day, items: [] }
      groups.push(current)
    }
    current.items.push(f)
  }
  return groups
})

function valenceTone(v: number): string {
  if (v > 0.3) return 'positive'
  if (v < -0.3) return 'negative'
  return 'neutral'
}

function valenceMarkerStyle(v: number, a: number): Record<string, string> {
  // Map valence (-1..1) to hue (240=blue/negative → 0=red/positive via 120 green)
  // Simpler: positive → green, neutral → gray, negative → red, sized by arousal.
  const tone = valenceTone(v)
  const size = 8 + Math.max(0, Math.min(1, a)) * 8
  const color = tone === 'positive' ? 'var(--ok)' : tone === 'negative' ? 'var(--error)' : 'var(--text-muted)'
  return {
    width: `${size}px`,
    height: `${size}px`,
    background: color,
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!store.dmnReflections) {
    store.fetchDmnReflections()
  }
  pollTimer = setInterval(() => store.fetchDmnReflections(), 10000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

function exportMarkdown(): void {
  const lines: string[] = []
  lines.push(`# 日记 · 反思`)
  lines.push('')
  lines.push(`- 导出时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`)
  lines.push(`- 条目数: ${reflections.value.length}`)
  if (mood.value) {
    lines.push(`- 情绪估算: valence ${mood.value.valence.toFixed(2)} · arousal ${mood.value.arousal.toFixed(2)}`)
  }
  lines.push('')
  for (const group of dayGroups.value) {
    lines.push(`## ${group.day}`)
    lines.push('')
    for (const f of group.items) {
      const t = new Date(f.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
      lines.push(`### ${t} · v ${f.valence.toFixed(2)} / a ${f.arousal.toFixed(2)}`)
      lines.push('')
      lines.push(f.content)
      lines.push('')
      if (f.tags?.length) {
        lines.push(`> tags: ${f.tags.join(', ')}`)
        lines.push('')
      }
    }
  }
  downloadText(
    `dream-reflections-${timestampSlug()}.md`,
    lines.join('\n'),
    'text/markdown;charset=utf-8',
  )
}
</script>

<template>
  <div class="dream-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">日记 · 反思</h1>
        <div class="view-subtitle">
          来自 DMN 反思阶段（18:00–19:00）的 Fragment 缓冲，FIFO 保留最近 20 条。
        </div>
      </div>
      <div class="mood-card" v-if="moodLabel">
        <span class="metric-label">情绪估算</span>
        <div class="mood-display" :class="`tone-${moodLabel.tone}`">
          <span class="mood-text">{{ moodLabel.text }}</span>
          <span class="mood-vals mono" v-if="mood">
            v {{ mood.valence.toFixed(2) }} · a {{ mood.arousal.toFixed(2) }}
          </span>
        </div>
      </div>
    </header>

    <div class="summary-row">
      <div class="summary-stat">
        <span class="stat-value mono">{{ count }}</span>
        <span class="stat-label">条记录</span>
      </div>
      <div class="summary-stat" v-if="count > 0">
        <span class="stat-value mono">{{ reflections[0].content.length }}</span>
        <span class="stat-label">最新条字数</span>
      </div>
      <div class="summary-stat" v-if="count > 0">
        <span class="stat-value mono">
          {{ reflections.reduce((s, f) => s + f.valence, 0).toFixed(2) }}
        </span>
        <span class="stat-label">总效价</span>
      </div>
      <button
        class="btn-export"
        @click="exportMarkdown"
        :disabled="!count"
        title="导出反思记录为 Markdown"
      >导出 .md</button>
    </div>

    <section class="card empty-card" v-if="count === 0">
      <div class="empty-state">
        <div class="empty-icon">🌙</div>
        <p>暂无反思记录。</p>
        <p class="muted">林逸会在每日 18:00–19:00 的反思阶段产生日记片段。</p>
      </div>
    </section>

    <section class="timeline" v-else>
      <div v-for="group in dayGroups" :key="group.day" class="day-group">
        <div class="day-header">
          <span class="day-label">{{ group.day }}</span>
          <span class="day-count mono">{{ group.items.length }} 条</span>
        </div>
        <ul class="entries">
          <li v-for="f in group.items" :key="f.id" class="entry">
            <div class="entry-marker">
              <span class="marker" :style="valenceMarkerStyle(f.valence, f.arousal)" />
            </div>
            <div class="entry-body">
              <div class="entry-meta">
                <span class="mono">{{ fmtTime(f.timestamp) }}</span>
                <span class="muted">valence {{ f.valence.toFixed(2) }}</span>
                <span class="muted">arousal {{ f.arousal.toFixed(2) }}</span>
                <span class="muted">salience {{ f.salience.toFixed(2) }}</span>
                <span class="tag" v-for="t in f.tags.slice(0, 4)" :key="t">{{ t }}</span>
              </div>
              <div class="entry-text">{{ f.content }}</div>
            </div>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dream-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 900px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
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
  font-size: 12px;
  margin-top: 4px;
  max-width: 500px;
  line-height: 1.5;
}

.mood-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  background: var(--bg-2);
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  min-width: 200px;
}

.mood-display {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.mood-text {
  font-size: 20px;
  font-weight: 600;
}

.mood-display.tone-high .mood-text { color: var(--sn); }
.mood-display.tone-positive .mood-text { color: var(--ok); }
.mood-display.tone-anxious .mood-text { color: var(--error); }
.mood-display.tone-low .mood-text { color: #8aa0c8; }
.mood-display.tone-neutral .mood-text { color: var(--text-secondary); }

.mood-vals {
  font-size: 11px;
  color: var(--text-muted);
}

.summary-row {
  display: flex;
  gap: 16px;
  align-items: center;
}

.summary-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  min-width: 100px;
}

.btn-export {
  margin-left: auto;
  padding: 6px 14px;
  font-size: 12px;
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
  border-color: var(--dmn);
}

.btn-export:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-top: 4px;
}

.empty-card {
  padding: 40px 20px;
}

.empty-state {
  text-align: center;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.day-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.day-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 0 0 6px 0;
  border-bottom: 1px solid var(--border-soft);
}

.day-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.day-count {
  font-size: 11px;
  color: var(--text-muted);
}

.entries {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entry {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-1);
  border-radius: 8px;
  border: 1px solid var(--border-soft);
}

.entry-marker {
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

.marker {
  display: inline-block;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}

.entry-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.entry-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--text-muted);
}

.entry-meta .mono {
  color: var(--text-secondary);
}

.entry-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
}

.mono {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
}

.muted {
  color: var(--text-muted);
}
</style>
