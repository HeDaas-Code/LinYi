<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { EosMetric, EosReport } from '@/types'
import { downloadText, timestampSlug } from '@/utils/export'

// EosView (EOS 观测台) — Phase 2.
//
// Surfaces the latest EOS evaluation report + recent report history. Each
// report carries a list of metrics (one per collector) and any alerts that
// breached thresholds. We render:
//   - Top: latest report summary + alert count + recommendations
//   - Middle: metric grid (categorized by source collector)
//   - Bottom: report history timeline with alert indicators
//
// Data comes from /api/eos/reports (new in Phase 2) which returns the last
// ~20 EvaluationReport instances in newest-first order.
//
// Phase 6: added "导出 Markdown" button to dump all loaded reports.

const store = useAgentStore()

const reports = computed<EosReport[]>(() => store.eosReports?.reports ?? [])
const latest = computed<EosReport | null>(() => reports.value[0] ?? null)
const history = computed<EosReport[]>(() => reports.value.slice(1))

const metrics = computed<EosMetric[]>(() => latest.value?.metrics ?? [])
const alerts = computed(() => latest.value?.alerts ?? [])
const recommendations = computed<string[]>(() => latest.value?.recommendations ?? [])

const totalAlerts = computed(() =>
  reports.value.reduce((s, r) => s + (r.alerts?.length ?? 0), 0),
)

function fmtTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function fmtTimeShort(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function metricValuePct(m: EosMetric): string {
  // EOS metric.value is already normalized to [0,1] via sigmoid.
  return `${(Math.max(0, Math.min(1, m.value)) * 100).toFixed(0)}%`
}

function metricValueWidth(m: EosMetric): string {
  return metricValuePct(m)
}

function severityTone(s: string): string {
  if (s === 'critical') return 'critical'
  if (s === 'warning') return 'warning'
  return 'normal'
}

interface MetricGroup {
  source: string
  label: string
  metrics: EosMetric[]
}

const metricGroups = computed<MetricGroup[]>(() => {
  const groups = new Map<string, MetricGroup>()
  for (const m of metrics.value) {
    const src = m.source || 'other'
    if (!groups.has(src)) {
      groups.set(src, {
        source: src,
        label: collectorLabel(src),
        metrics: [],
      })
    }
    groups.get(src)!.metrics.push(m)
  }
  return Array.from(groups.values())
})

function collectorLabel(source: string): string {
  const map: Record<string, string> = {
    llm_collector: 'LLM 调用',
    memory_collector: '记忆系统',
    metabolism_collector: '代谢能量',
    sandbox_collector: '沙盘叙事',
    social_collector: '社会空间',
    network_collector: '网络切换',
    creative_collector: '创意生成',
  }
  return map[source] ?? source
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!store.eosReports) {
    store.fetchEosReports()
  }
  // EOS evaluates every 6 ticks (~6 minutes); poll every 15s is plenty.
  pollTimer = setInterval(() => store.fetchEosReports(), 15000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

function exportMarkdown(): void {
  const lines: string[] = []
  lines.push(`# EOS 观测台导出`)
  lines.push('')
  lines.push(`- 生成时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`)
  lines.push(`- 报告数量: ${reports.value.length}`)
  lines.push(`- 总告警数: ${totalAlerts.value}`)
  lines.push('')
  for (const r of reports.value) {
    lines.push(`## 报告 ${r.id} · ${new Date(r.timestamp).toLocaleString('zh-CN', { hour12: false })}`)
    lines.push('')
    lines.push(`- 触发: \`${r.trigger}\``)
    if (r.summary) lines.push(`- 摘要: ${r.summary}`)
    lines.push('')
    if (r.alerts?.length) {
      lines.push('### 告警')
      lines.push('')
      for (const a of r.alerts) {
        lines.push(`- **${a.metric_name}** (\`${a.metric_id}\`) — 严重度 \`${a.severity}\`，当前值 \`${a.value}\``)
      }
      lines.push('')
    }
    if (r.recommendations?.length) {
      lines.push('### 建议')
      lines.push('')
      for (const rec of r.recommendations) {
        lines.push(`- ${rec}`)
      }
      lines.push('')
    }
    if (r.metrics?.length) {
      lines.push('### 指标')
      lines.push('')
      lines.push('| 指标 | 类别 | 值 | 严重度 | 来源 |')
      lines.push('|------|------|----|--------|------|')
      for (const m of r.metrics) {
        lines.push(`| ${m.name} | ${m.category} | ${m.value.toFixed(4)} | ${m.severity} | ${m.source} |`)
      }
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  }
  downloadText(
    `eos-report-${timestampSlug()}.md`,
    lines.join('\n'),
    'text/markdown;charset=utf-8',
  )
}
</script>

<template>
  <div class="eos-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">EOS 观测台</h1>
        <div class="view-subtitle">
          Evaluation & Observability System · 8 个 Collector 的实时指标 + 阈值告警
        </div>
      </div>
      <div class="summary-row">
        <div class="summary-stat">
          <span class="stat-value mono">{{ reports.length }}</span>
          <span class="stat-label">报告</span>
        </div>
        <div class="summary-stat" :class="{ 'alert-on': totalAlerts > 0 }">
          <span class="stat-value mono">{{ totalAlerts }}</span>
          <span class="stat-label">告警</span>
        </div>
        <button
          class="btn-export"
          @click="exportMarkdown"
          :disabled="!reports.length"
          title="导出全部报告为 Markdown"
        >导出 .md</button>
      </div>
    </header>

    <!-- Latest report summary -->
    <section class="card" v-if="latest">
      <div class="latest-header">
        <h2 class="card-title">最新报告</h2>
        <div class="latest-meta">
          <span class="mono">{{ latest.id }}</span>
          <span class="muted">·</span>
          <span class="mono">{{ fmtTime(latest.timestamp) }}</span>
          <span class="tag">{{ latest.trigger }}</span>
        </div>
      </div>
      <p class="latest-summary" v-if="latest.summary">{{ latest.summary }}</p>

      <div class="latest-grid">
        <div class="latest-cell">
          <span class="metric-label">指标数</span>
          <span class="mono">{{ metrics.length }}</span>
        </div>
        <div class="latest-cell">
          <span class="metric-label">告警数</span>
          <span class="mono" :class="{ 'alert-text': alerts.length > 0 }">{{ alerts.length }}</span>
        </div>
        <div class="latest-cell">
          <span class="metric-label">建议数</span>
          <span class="mono">{{ recommendations.length }}</span>
        </div>
      </div>
    </section>

    <!-- Alerts -->
    <section class="card alert-card" v-if="alerts.length">
      <h2 class="card-title">活跃告警</h2>
      <ul class="alert-list">
        <li v-for="(a, i) in alerts" :key="i" class="alert-item" :class="`tone-${severityTone(a.severity)}`">
          <span class="alert-sev">{{ a.severity }}</span>
          <span class="alert-name">{{ a.metric_name }}</span>
          <span class="mono alert-value">{{ typeof a.value === 'number' ? a.value.toFixed(3) : a.value }}</span>
          <span class="muted">·</span>
          <span class="alert-id mono">{{ a.metric_id }}</span>
        </li>
      </ul>
    </section>

    <!-- Recommendations -->
    <section class="card" v-if="recommendations.length">
      <h2 class="card-title">建议</h2>
      <ul class="rec-list">
        <li v-for="(r, i) in recommendations" :key="i" class="rec-item">{{ r }}</li>
      </ul>
    </section>

    <!-- Metric grid grouped by collector -->
    <section class="card" v-if="metricGroups.length">
      <h2 class="card-title">指标明细 · 按 Collector 分组</h2>
      <div class="metric-groups">
        <div v-for="g in metricGroups" :key="g.source" class="metric-group">
          <h3 class="group-label">{{ g.label }}</h3>
          <div class="metric-rows">
            <div v-for="m in g.metrics" :key="m.id" class="metric-row" :class="`tone-${severityTone(m.severity)}`">
              <div class="metric-row-head">
                <span class="metric-name">{{ m.name }}</span>
                <span class="metric-value mono">{{ metricValuePct(m) }}</span>
              </div>
              <div class="metric-bar">
                <div class="metric-fill" :class="`tone-${severityTone(m.severity)}`" :style="{ width: metricValueWidth(m) }" />
              </div>
              <div class="metric-row-foot">
                <span class="muted">id {{ m.id }}</span>
                <span class="muted" v-if="m.unit">unit {{ m.unit }}</span>
                <span class="muted" v-if="typeof m.raw_value === 'number'">raw {{ m.raw_value.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Report history -->
    <section class="card" v-if="history.length">
      <h2 class="card-title">报告历史</h2>
      <ul class="history-list">
        <li v-for="r in history" :key="r.id" class="history-item">
          <div class="hist-time mono">{{ fmtTimeShort(r.timestamp) }}</div>
          <div class="hist-id mono">{{ r.id }}</div>
          <div class="hist-trigger">{{ r.trigger }}</div>
          <div class="hist-metrics muted">{{ r.metrics.length }} 指标</div>
          <div class="hist-alerts" :class="{ 'alert-text': r.alerts.length > 0 }">
            {{ r.alerts.length }} 告警
          </div>
        </li>
      </ul>
    </section>

    <section class="card empty-card" v-if="!latest">
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>暂无 EOS 报告。</p>
        <p class="muted">系统每隔 6 个 tick（约 6 分钟）或阶段切换时生成报告。</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.eos-view {
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
}

.summary-row {
  display: flex;
  gap: 12px;
}

.summary-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 16px;
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  min-width: 80px;
}

.summary-stat.alert-on {
  border-color: var(--warn);
  background: rgba(250, 204, 21, 0.08);
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
  margin-top: 2px;
}

.btn-export {
  align-self: center;
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
  border-color: var(--cen);
}

.btn-export:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.latest-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}

.latest-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.latest-summary {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.6;
}

.latest-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.latest-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  background: var(--bg-2);
  border-radius: 6px;
}

.alert-card {
  border-color: var(--warn);
}

.alert-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-2);
  border-radius: 6px;
  font-size: 12px;
  border-left: 3px solid var(--border-soft);
}

.alert-item.tone-critical {
  border-left-color: var(--error);
  background: rgba(248, 113, 113, 0.08);
}
.alert-item.tone-warning {
  border-left-color: var(--warn);
  background: rgba(250, 204, 21, 0.06);
}

.alert-sev {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-3);
  color: var(--text-secondary);
}

.alert-item.tone-critical .alert-sev {
  background: rgba(248, 113, 113, 0.18);
  color: var(--error);
}
.alert-item.tone-warning .alert-sev {
  background: rgba(250, 204, 21, 0.18);
  color: var(--warn);
}

.alert-name {
  flex: 1;
  color: var(--text-primary);
}

.alert-value {
  color: var(--text-primary);
}

.alert-id {
  font-size: 10px;
  color: var(--text-muted);
}

.alert-text {
  color: var(--warn);
  font-weight: 600;
}

.rec-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rec-item {
  padding: 8px 12px;
  background: var(--bg-2);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.6;
}

.metric-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.metric-group {
  background: var(--bg-2);
  border-radius: 8px;
  padding: 12px;
}

.group-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin: 0 0 10px 0;
}

.metric-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.metric-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-row-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.metric-name {
  font-size: 12px;
  color: var(--text-primary);
}

.metric-value {
  font-size: 12px;
  color: var(--text-primary);
}

.metric-bar {
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
  overflow: hidden;
}

.metric-fill {
  height: 100%;
  background: var(--cen);
  transition: width 0.4s var(--ease-out);
}

.metric-fill.tone-warning { background: var(--warn); }
.metric-fill.tone-critical { background: var(--error); }

.metric-row-foot {
  display: flex;
  gap: 10px;
  font-size: 9px;
  flex-wrap: wrap;
}

.metric-label {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item {
  display: grid;
  grid-template-columns: 50px 100px 1fr 80px 80px;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-2);
  border-radius: 4px;
  font-size: 11px;
}

.hist-time {
  color: var(--text-secondary);
}

.hist-id {
  color: var(--text-muted);
  font-size: 10px;
}

.hist-trigger {
  color: var(--text-primary);
}

.hist-alerts {
  text-align: right;
}

.muted {
  color: var(--text-muted);
}

.mono {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
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
</style>
