<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  WorldRuleEntry,
  WorldSnapshotResponse,
  WorldTimelineEvent,
  WorldTimelineEventType,
} from '@/types'

// WorldTimeline — Stage 5 Task 5.2 SubTask 5.2.2
//
// 时间线组件：把世界快照中的规则引入、历史事件、伏笔引入/回收、规则
// 被打破记录聚合成统一的事件流，按时间倒序展示并支持按类型筛选。
//
// 数据来源（按任务说明）：
//   - 历史事件：snapshot.rules 中带 introduced_in 字段、或 description 中
//     携带历史事件关键字的条目（后端 models.py 的 WorldRule.introduced_in
//     字段表示规则被引入的章节/事件，等价于“历史事件锚点”）。
//   - 规则被打破：snapshot.rules 中 violated_count > 0 的条目。
//   - 伏笔引入/回收：当前后端 snapshot 暂未直接携带 foreshadowing_ledger，
//     组件预留了 props.foreshadowing 接口供 WorldView 后续注入（例如从
//     StoryBible / 后端 audit issue 接口获取）。
//   - 快照发布：每次收到新 snapshot 自身的时间戳也作为一条事件。
//
// 注：任务说明里提到的 audit issues 中 category="setting_conflict" 来源
//     由 Task 5.3 在 /debug/world/snapshot 之外暴露，组件用 foreshadowing
//     / auditIssues 两个可选 props 接收，不强制依赖。

const props = defineProps<{
  snapshot: WorldSnapshotResponse | null
  loading?: boolean
  error?: string | null
  // 可选：来自 StoryBible.foreshadowing_ledger 的伏笔条目
  foreshadowing?: Array<{
    id: string
    title?: string
    description?: string
    introduced_at?: string | number
    resolved_at?: string | number | null
    status?: string
  }>
  // 可选：来自 audit / continuity_auditor 的设置冲突 issues
  auditIssues?: Array<{
    id: string
    category?: string
    severity?: string
    description?: string
    timestamp?: string | number
  }>
}>()

// 类型筛选：默认全选，可单独勾选/取消。
const typeFilters = ref<Record<WorldTimelineEventType, boolean>>({
  historical: true,
  rule_introduced: true,
  rule_broken: true,
  foreshadow_in: true,
  foreshadow_out: true,
  snapshot: true,
  other: true,
})

const TYPE_META: Record<WorldTimelineEventType, { label: string; tone: string }> = {
  historical: { label: '历史事件', tone: 'cen' },
  rule_introduced: { label: '规则引入', tone: 'sn' },
  rule_broken: { label: '规则打破', tone: 'error' },
  foreshadow_in: { label: '伏笔引入', tone: 'gold' },
  foreshadow_out: { label: '伏笔回收', tone: 'ok' },
  snapshot: { label: '快照', tone: 'neutral' },
  other: { label: '其他', tone: 'neutral' },
}

function toMillis(ts: string | number | null | undefined): number {
  if (ts == null) return 0
  if (typeof ts === 'number') return ts
  const t = Date.parse(ts)
  return Number.isNaN(t) ? 0 : t
}

function fmtTime(ts: string | number | null | undefined): string {
  if (ts == null || ts === '') return '—'
  const ms = toMillis(ts)
  if (!ms) return String(ts)
  return new Date(ms).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

// 把规则条目转换成时间线事件。规则可能同时产生“引入”与“打破”两条事件。
function eventsFromRules(rules: WorldRuleEntry[]): WorldTimelineEvent[] {
  const events: WorldTimelineEvent[] = []
  for (const r of rules ?? []) {
    const id = (r.rule_id as string) || (r.id as string) || JSON.stringify(r).slice(0, 32)
    const desc = (r.description as string) || ''
    if (r.introduced_in) {
      events.push({
        id: `rule-in:${id}`,
        type: 'rule_introduced',
        timestamp: r.introduced_in as string,
        title: `规则引入：${desc.slice(0, 32) || id}`,
        description: desc,
        source: id,
        severity: 'info',
      })
    }
    const broken = typeof r.violated_count === 'number' ? r.violated_count : 0
    if (broken > 0) {
      events.push({
        id: `rule-broken:${id}`,
        type: 'rule_broken',
        timestamp: null,
        title: `规则被打破 ×${broken}：${desc.slice(0, 32) || id}`,
        description: desc,
        source: id,
        severity: 'error',
      })
    }
    // 兜底：规则没有 introduced_in 也没有 broken，按历史事件归档（按任务
    // 说明的“规则中 introduced_in 或 historical_events”双通道）。
    if (!r.introduced_in && broken === 0 && desc) {
      events.push({
        id: `rule-hist:${id}`,
        type: 'historical',
        timestamp: null,
        title: `规则记录：${desc.slice(0, 32) || id}`,
        description: desc,
        source: id,
        severity: 'info',
      })
    }
  }
  return events
}

function eventsFromForeshadowing(list: NonNullable<typeof props.foreshadowing>): WorldTimelineEvent[] {
  const events: WorldTimelineEvent[] = []
  for (const f of list ?? []) {
    if (f.introduced_at) {
      events.push({
        id: `fs-in:${f.id}`,
        type: 'foreshadow_in',
        timestamp: f.introduced_at,
        title: `伏笔引入：${f.title || f.id}`,
        description: f.description,
        source: f.id,
        severity: 'info',
      })
    }
    if (f.resolved_at) {
      events.push({
        id: `fs-out:${f.id}`,
        type: 'foreshadow_out',
        timestamp: f.resolved_at,
        title: `伏笔回收：${f.title || f.id}`,
        description: f.description,
        source: f.id,
        severity: 'info',
      })
    }
  }
  return events
}

function eventsFromAudit(list: NonNullable<typeof props.auditIssues>): WorldTimelineEvent[] {
  const events: WorldTimelineEvent[] = []
  for (const a of list ?? []) {
    if (a.category && a.category !== 'setting_conflict') continue
    events.push({
      id: `audit:${a.id}`,
      type: 'rule_broken',
      timestamp: a.timestamp ?? null,
      title: `设置冲突：${a.id}`,
      description: a.description,
      source: a.id,
      severity: a.severity === 'error' ? 'error' : 'warn',
    })
  }
  return events
}

function eventsFromSnapshot(snap: WorldSnapshotResponse | null): WorldTimelineEvent[] {
  if (!snap) return []
  return [{
    id: `snap:${snap.snapshot_id}`,
    type: 'snapshot',
    timestamp: snap.timestamp,
    title: `世界快照 v${snap.version}`,
    description: `${snap.geography?.length ?? 0} 地点 · ${snap.factions?.length ?? 0} 势力 · ${snap.characters?.length ?? 0} 角色`,
    source: snap.snapshot_id,
    severity: 'info',
  }]
}

// 聚合所有事件源；按时间倒序（最新在前），无时间戳的排在最后。
const allEvents = computed<WorldTimelineEvent[]>(() => {
  const list: WorldTimelineEvent[] = []
  list.push(...eventsFromSnapshot(props.snapshot))
  list.push(...eventsFromRules(props.snapshot?.rules ?? []))
  list.push(...eventsFromForeshadowing(props.foreshadowing ?? []))
  list.push(...eventsFromAudit(props.auditIssues ?? []))
  list.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
  return list
})

const filteredEvents = computed<WorldTimelineEvent[]>(() => {
  return allEvents.value.filter((e) => typeFilters.value[e.type])
})

const counts = computed<Record<WorldTimelineEventType, number>>(() => {
  const c: Record<WorldTimelineEventType, number> = {
    historical: 0, rule_introduced: 0, rule_broken: 0,
    foreshadow_in: 0, foreshadow_out: 0, snapshot: 0, other: 0,
  }
  for (const e of allEvents.value) c[e.type] += 1
  return c
})

function toggleType(t: WorldTimelineEventType): void {
  typeFilters.value[t] = !typeFilters.value[t]
}

function eventTone(t: WorldTimelineEventType): string {
  return TYPE_META[t].tone
}

function eventLabel(t: WorldTimelineEventType): string {
  return TYPE_META[t].label
}
</script>

<template>
  <div class="world-timeline">
    <div class="filter-bar">
      <button
        v-for="(meta, t) in TYPE_META"
        :key="t"
        :class="['filter-chip', `tone-${meta.tone}`, { active: typeFilters[t] }]"
        @click="toggleType(t)"
      >
        <span class="chip-label">{{ meta.label }}</span>
        <span class="chip-count">{{ counts[t] }}</span>
      </button>
    </div>

    <div class="timeline-list-wrap">
      <div v-if="loading" class="empty muted">加载中…</div>
      <div v-else-if="error" class="empty error">
        接口不可用：{{ error }}
        <p class="hint muted">时间线将退化为只展示已收到的快照事件。</p>
      </div>
      <div v-else-if="!filteredEvents.length" class="empty muted">暂无事件</div>

      <ol v-else class="timeline-list">
        <li
          v-for="e in filteredEvents"
          :key="e.id"
          :class="['tl-row', `tone-${eventTone(e.type)}`]"
        >
          <span class="tl-marker" />
          <div class="tl-body">
            <div class="tl-meta">
              <span class="mono">{{ fmtTime(e.timestamp) }}</span>
              <span class="tag" :class="`tone-${eventTone(e.type)}`">{{ eventLabel(e.type) }}</span>
              <span class="muted" v-if="e.source">来源：{{ e.source }}</span>
              <span class="tag" v-if="e.severity === 'error'">严重</span>
              <span class="tag warn" v-else-if="e.severity === 'warn'">警告</span>
            </div>
            <div class="tl-title">{{ e.title }}</div>
            <div class="tl-desc muted" v-if="e.description">{{ e.description }}</div>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.world-timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s var(--ease-out), color 0.12s var(--ease-out);
}
.filter-chip:hover { background: var(--bg-3); color: var(--text-primary); }
.filter-chip.active { background: var(--bg-3); color: var(--text-primary); border-color: var(--cen); }

.filter-chip.tone-cen.active { border-color: var(--cen); }
.filter-chip.tone-sn.active { border-color: var(--sn); }
.filter-chip.tone-error.active { border-color: var(--error); }
.filter-chip.tone-gold.active { border-color: #d4af37; }
.filter-chip.tone-ok.active { border-color: var(--ok); }
.filter-chip.tone-neutral.active { border-color: var(--text-secondary); }

.chip-count {
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--bg-1);
  padding: 0 6px;
  border-radius: 8px;
}

.timeline-list-wrap {
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 12px;
  max-height: 540px;
  overflow-y: auto;
}

.timeline-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tl-row {
  display: grid;
  grid-template-columns: 14px 1fr;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-2);
  border-radius: 6px;
  border-left: 3px solid var(--border);
}

.tl-row.tone-cen { border-left-color: var(--cen); }
.tl-row.tone-sn { border-left-color: var(--sn); }
.tl-row.tone-error { border-left-color: var(--error); }
.tl-row.tone-gold { border-left-color: #d4af37; }
.tl-row.tone-ok { border-left-color: var(--ok); }
.tl-row.tone-neutral { border-left-color: var(--text-secondary); }

.tl-marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  background: var(--text-muted);
}
.tl-row.tone-cen .tl-marker { background: var(--cen); }
.tl-row.tone-sn .tl-marker { background: var(--sn); }
.tl-row.tone-error .tl-marker { background: var(--error); }
.tl-row.tone-gold .tl-marker { background: #d4af37; }
.tl-row.tone-ok .tl-marker { background: var(--ok); }

.tl-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.tl-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  font-size: 10px;
  color: var(--text-muted);
}

.mono { font-family: var(--font-mono); color: var(--text-secondary); }

.tag {
  font-size: 10px;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--bg-3);
  color: var(--text-secondary);
  border: 1px solid var(--border-soft);
}
.tag.warn { background: rgba(250, 204, 21, 0.16); color: var(--warn); }
.tag.tone-cen { background: var(--cen-soft); color: var(--cen); }
.tag.tone-sn { background: var(--sn-soft); color: var(--sn); }
.tag.tone-error { background: rgba(248, 113, 113, 0.16); color: var(--error); }
.tag.tone-gold { background: rgba(212, 175, 55, 0.18); color: #d4af37; }
.tag.tone-ok { background: rgba(74, 222, 128, 0.16); color: var(--ok); }
.tag.tone-neutral { background: var(--bg-3); color: var(--text-secondary); }

.tl-title {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}

.tl-desc {
  font-size: 12px;
  line-height: 1.5;
}

.muted { color: var(--text-muted); }
.error { color: var(--error); }

.empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}
.empty.error { color: var(--error); }
.empty .hint { font-size: 11px; margin-top: 6px; }
</style>
