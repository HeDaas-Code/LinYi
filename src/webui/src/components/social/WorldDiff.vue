<script setup lang="ts">
import { computed, watch } from 'vue'
import type {
  WorldDiffModifiedEntry,
  WorldDiffResponse,
  WorldSnapshotResponse,
} from '@/types'

// WorldDiff — Stage 5 Task 5.2 SubTask 5.2.3
//
// 状态对比组件：展示两个世界版本之间的差异。
//   - 三段：added / removed / modified
//   - 四组：geography / factions / rules / characters
//   - 版本选择器（两个下拉框，从 snapshotHistory 中读取可选版本）
//
// 调用 GET /debug/world/diff?from_version=...&to_version=...
// 由父组件（WorldView）通过 v-model:fromVersion / v-model:toVersion 暴露
// 双向绑定，并监听 fetchDiff 触发；本组件只负责渲染。

const props = defineProps<{
  diff: WorldDiffResponse | null
  loading?: boolean
  error?: string | null
  // 可选的快照历史，用于版本选择器选项（若无则只能用 diff 自身的 from/to）。
  snapshotHistory?: WorldSnapshotResponse[]
  fromVersion: string
  toVersion: string
}>()

const emit = defineEmits<{
  (e: 'update:fromVersion', v: string): void
  (e: 'update:toVersion', v: string): void
  (e: 'fetch-diff'): void
}>()

interface SectionMeta {
  key: 'geography' | 'factions' | 'rules' | 'characters'
  label: string
  tone: string
}

const SECTIONS: SectionMeta[] = [
  { key: 'geography', label: '地点', tone: 'cen' },
  { key: 'factions', label: '势力', tone: 'sn' },
  { key: 'rules', label: '规则', tone: 'gold' },
  { key: 'characters', label: '角色', tone: 'dmn' },
]

// 版本选择器的可选项。优先使用父组件传入的 snapshotHistory；若没有，
// 退回到 diff 自身的 from/to 两个版本。
const versionOptions = computed<string[]>(() => {
  const opts: string[] = []
  if (props.snapshotHistory && props.snapshotHistory.length) {
    for (const s of props.snapshotHistory) opts.push(s.version)
  }
  if (props.diff) {
    if (props.diff.from_version) opts.push(props.diff.from_version)
    if (props.diff.to_version) opts.push(props.diff.to_version)
  }
  // 去重并保留顺序
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of opts) {
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
})

function onFromChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  emit('update:fromVersion', v)
}

function onToChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  emit('update:toVersion', v)
}

function onApply(): void {
  emit('fetch-diff')
}

// 摘要：每段每组的条数，方便顶部一栏快速预览。
interface SectionStat {
  key: SectionMeta['key']
  label: string
  tone: string
  added: number
  removed: number
  modified: number
}

const sectionStats = computed<SectionStat[]>(() => {
  const d = props.diff
  return SECTIONS.map((s) => ({
    key: s.key,
    label: s.label,
    tone: s.tone,
    added: d?.added?.[s.key]?.length ?? 0,
    removed: d?.removed?.[s.key]?.length ?? 0,
    modified: d?.modified?.[s.key]?.length ?? 0,
  }))
})

const totalAdded = computed(() => sectionStats.value.reduce((a, s) => a + s.added, 0))
const totalRemoved = computed(() => sectionStats.value.reduce((a, s) => a + s.removed, 0))
const totalModified = computed(() => sectionStats.value.reduce((a, s) => a + s.modified, 0))

// 把任意 entry 渲染成可读字符串（用于 added / removed 列表项）。
function entryLabel(entry: Record<string, unknown>): string {
  if (!entry || typeof entry !== 'object') return String(entry)
  const name = entry.name || entry.character_id || entry.rule_id || entry.id || entry.key
  if (name) return String(name)
  // 兜底：取第一个非空字符串字段
  for (const v of Object.values(entry)) {
    if (typeof v === 'string' && v) return v
  }
  return JSON.stringify(entry).slice(0, 40)
}

function entrySub(entry: Record<string, unknown>): string {
  if (!entry || typeof entry !== 'object') return ''
  const desc = entry.description
  if (typeof desc === 'string' && desc) return desc
  const archetype = entry.archetype
  if (typeof archetype === 'string' && archetype) return `archetype: ${archetype}`
  return ''
}

// modified 条目里挑出真正变化的字段（最多展示 5 个），避免把整条 entry dump 出来。
function modifiedChanged(m: WorldDiffModifiedEntry): Array<[string, unknown, unknown]> {
  const out: Array<[string, unknown, unknown]> = []
  const f = m.from ?? {}
  const t = m.to ?? {}
  const keys = new Set<string>([...Object.keys(f), ...Object.keys(t)])
  for (const k of keys) {
    const fv = (f as Record<string, unknown>)[k]
    const tv = (t as Record<string, unknown>)[k]
    if (JSON.stringify(fv) !== JSON.stringify(tv)) {
      out.push([k, fv, tv])
      if (out.length >= 5) break
    }
  }
  return out
}

function fmtVal(v: unknown): string {
  if (v == null) return '—'
  if (Array.isArray(v)) return v.length ? v.join(' · ') : '[]'
  if (typeof v === 'object') return '[object]'
  return String(v)
}

// 监听版本号变化，自动触发 fetch-diff（仅当两端都有值时）。
watch(
  () => [props.fromVersion, props.toVersion] as const,
  ([f, t]) => {
    if (f && t && f !== t) {
      emit('fetch-diff')
    }
  },
)
</script>

<template>
  <div class="world-diff">
    <div class="diff-toolbar">
      <div class="version-picker">
        <label>
          <span class="picker-label">from</span>
          <select :value="fromVersion" @change="onFromChange">
            <option value="" disabled>选择版本</option>
            <option v-for="v in versionOptions" :key="`f-${v}`" :value="v">{{ v }}</option>
          </select>
        </label>
        <span class="arrow">→</span>
        <label>
          <span class="picker-label">to</span>
          <select :value="toVersion" @change="onToChange">
            <option value="" disabled>选择版本</option>
            <option v-for="v in versionOptions" :key="`t-${v}`" :value="v">{{ v }}</option>
          </select>
        </label>
        <button class="link-btn" @click="onApply" :disabled="!fromVersion || !toVersion || fromVersion === toVersion">
          对比
        </button>
      </div>
      <div class="diff-summary" v-if="diff">
        <span class="stat added">+{{ totalAdded }}</span>
        <span class="stat removed">−{{ totalRemoved }}</span>
        <span class="stat modified">~{{ totalModified }}</span>
        <span class="muted" v-if="diff.timestamp">{{ diff.timestamp }}</span>
      </div>
    </div>

    <div v-if="loading" class="empty muted">对比中…</div>
    <div v-else-if="error" class="empty error">
      接口不可用：{{ error }}
      <p class="hint muted">请确认后端 web/app.py 已实现 <code>GET /debug/world/diff</code>。</p>
    </div>
    <div v-else-if="!diff" class="empty muted">选择两个版本后点击「对比」</div>

    <div v-else class="diff-sections">
      <section
        v-for="s in SECTIONS"
        :key="s.key"
        :class="['diff-section', `tone-${s.tone}`]"
      >
        <header class="section-head">
          <h3 class="section-title">{{ s.label }}</h3>
          <div class="section-stats">
            <span class="mini added">+{{ sectionStats.find((x) => x.key === s.key)?.added ?? 0 }}</span>
            <span class="mini removed">−{{ sectionStats.find((x) => x.key === s.key)?.removed ?? 0 }}</span>
            <span class="mini modified">~{{ sectionStats.find((x) => x.key === s.key)?.modified ?? 0 }}</span>
          </div>
        </header>

        <div :class="['diff-grid', { empty: !diff.added[s.key].length && !diff.removed[s.key].length && !diff.modified[s.key].length }]">
          <!-- added -->
          <div class="diff-col added">
            <div class="col-head">新增</div>
            <ul class="col-list">
              <li v-for="(item, i) in diff.added[s.key]" :key="`a-${i}`" class="col-item">
                <div class="item-label">{{ entryLabel(item) }}</div>
                <div class="item-sub muted" v-if="entrySub(item)">{{ entrySub(item) }}</div>
              </li>
              <li v-if="!diff.added[s.key].length" class="col-empty muted">—</li>
            </ul>
          </div>

          <!-- removed -->
          <div class="diff-col removed">
            <div class="col-head">移除</div>
            <ul class="col-list">
              <li v-for="(item, i) in diff.removed[s.key]" :key="`r-${i}`" class="col-item">
                <div class="item-label">{{ entryLabel(item) }}</div>
                <div class="item-sub muted" v-if="entrySub(item)">{{ entrySub(item) }}</div>
              </li>
              <li v-if="!diff.removed[s.key].length" class="col-empty muted">—</li>
            </ul>
          </div>

          <!-- modified -->
          <div class="diff-col modified">
            <div class="col-head">修改</div>
            <ul class="col-list">
              <li v-for="(m, i) in diff.modified[s.key]" :key="`m-${i}`" class="col-item">
                <div class="item-label">{{ m.id }}</div>
                <ul class="field-list">
                  <li v-for="(row, j) in modifiedChanged(m)" :key="j" class="field-row">
                    <span class="field-key mono">{{ row[0] }}</span>
                    <span class="field-from">{{ fmtVal(row[1]) }}</span>
                    <span class="arrow">→</span>
                    <span class="field-to">{{ fmtVal(row[2]) }}</span>
                  </li>
                </ul>
              </li>
              <li v-if="!diff.modified[s.key].length" class="col-empty muted">—</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.world-diff {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diff-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
}

.version-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.version-picker label {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
}

.picker-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.version-picker select {
  padding: 4px 8px;
  background: var(--bg-1);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--font-mono);
  min-width: 120px;
}

.arrow {
  color: var(--text-muted);
  font-size: 14px;
  align-self: end;
  padding-bottom: 4px;
}

.link-btn {
  align-self: end;
  background: transparent;
  border: 1px solid var(--cen);
  color: var(--cen);
  padding: 4px 14px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}
.link-btn:hover:not(:disabled) { background: var(--cen-soft); }
.link-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.diff-summary {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  font-family: var(--font-mono);
}

.stat.added { color: var(--ok); }
.stat.removed { color: var(--error); }
.stat.modified { color: var(--warn); }

.diff-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diff-section {
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-left: 3px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}

.diff-section.tone-cen { border-left-color: var(--cen); }
.diff-section.tone-sn { border-left-color: var(--sn); }
.diff-section.tone-gold { border-left-color: #d4af37; }
.diff-section.tone-dmn { border-left-color: var(--dmn); }

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-stats {
  display: flex;
  gap: 8px;
  font-size: 11px;
  font-family: var(--font-mono);
}
.mini.added { color: var(--ok); }
.mini.removed { color: var(--error); }
.mini.modified { color: var(--warn); }

.diff-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr;
  gap: 8px;
}

.diff-grid.empty .diff-col {
  opacity: 0.4;
}

.diff-col {
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 8px 10px;
  min-height: 60px;
}
.diff-col.added { border-top: 2px solid var(--ok); }
.diff-col.removed { border-top: 2px solid var(--error); }
.diff-col.modified { border-top: 2px solid var(--warn); }

.col-head {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}

.col-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.col-item {
  background: var(--bg-1);
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.item-label {
  color: var(--text-primary);
  font-weight: 500;
  word-break: break-all;
}

.item-sub {
  font-size: 11px;
  margin-top: 2px;
}

.col-empty {
  text-align: center;
  font-size: 11px;
  padding: 4px 0;
}

.field-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.field-row {
  display: grid;
  grid-template-columns: 70px 1fr 12px 1fr;
  gap: 6px;
  align-items: center;
  font-size: 10px;
}

.field-key { color: var(--text-muted); }
.field-from { color: var(--error); word-break: break-all; }
.field-to { color: var(--ok); word-break: break-all; }

.mono { font-family: var(--font-mono); }
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
.empty code {
  font-family: var(--font-mono);
  background: var(--bg-3);
  padding: 1px 4px;
  border-radius: 3px;
}

@media (max-width: 760px) {
  .diff-grid {
    grid-template-columns: 1fr;
  }
}
</style>
