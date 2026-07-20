<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { downloadText, timestampSlug } from '@/utils/export'

// NovelView (小说手稿) — Phase 4.
//
// Reader-style view of the manuscript produced by NovelOutput.
// Layout:
//   - Header card: title / author / version / counts + world_settings
//   - Latest paragraph highlight (the most recently published beat)
//   - Scrollable paragraph stream (typography tuned for long-form reading)
//
// Data source: /api/novel/manuscript → NovelOutput.paragraphs (public attrs).
//
// Phase 6: added "导出 .txt" and "导出 .md" buttons.

const store = useAgentStore()

const manuscript = computed(() => store.novelManuscript)
const paragraphs = computed<string[]>(() => manuscript.value?.paragraphs ?? [])
const worldSettings = computed<Array<[string, unknown]>>(() => {
  const ws = manuscript.value?.world_settings
  if (!ws || typeof ws !== 'object') return []
  return Object.entries(ws).slice(0, 16)
})

const fontSize = ref(16)
const showLatestOnly = ref(false)

const visibleParagraphs = computed<string[]>(() => {
  if (showLatestOnly.value) {
    return paragraphs.value.slice(-12)
  }
  return paragraphs.value
})

function fmtTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function bumpFont(delta: number) {
  fontSize.value = Math.max(12, Math.min(22, fontSize.value + delta))
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!store.novelManuscript) {
    store.fetchNovelManuscript()
  }
  // Manuscript grows slowly; 30s polling is plenty.
  pollTimer = setInterval(() => store.fetchNovelManuscript(), 30000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

function exportTxt(): void {
  if (!manuscript.value) return
  const lines: string[] = []
  lines.push(manuscript.value.title || '未命名')
  lines.push(`作者：${manuscript.value.author_name || '林逸'}    版本：v${manuscript.value.version ?? 0}`)
  lines.push('='.repeat(40))
  lines.push('')
  for (const p of manuscript.value.paragraphs) {
    lines.push(`　　${p}`)
    lines.push('')
  }
  downloadText(
    `${manuscript.value.title || 'novel'}-${timestampSlug()}.txt`,
    lines.join('\n'),
  )
}

function exportMarkdown(): void {
  if (!manuscript.value) return
  const lines: string[] = []
  lines.push(`# ${manuscript.value.title || '未命名'}`)
  lines.push('')
  lines.push(`> 作者：${manuscript.value.author_name || '林逸'} · 版本：v${manuscript.value.version ?? 0} · 段落数：${manuscript.value.paragraph_count ?? 0}`)
  lines.push('')
  if (worldSettings.value.length) {
    lines.push('## 世界设定')
    lines.push('')
    for (const [k, v] of worldSettings.value) {
      let val = '—'
      if (Array.isArray(v)) val = v.join(' · ')
      else if (typeof v === 'object' && v !== null) val = JSON.stringify(v)
      else if (v !== null && v !== undefined) val = String(v)
      lines.push(`- **${k}**: ${val}`)
    }
    lines.push('')
  }
  lines.push('## 正文')
  lines.push('')
  for (const p of manuscript.value.paragraphs) {
    lines.push(p)
    lines.push('')
  }
  downloadText(
    `${manuscript.value.title || 'novel'}-${timestampSlug()}.md`,
    lines.join('\n'),
    'text/markdown;charset=utf-8',
  )
}
</script>

<template>
  <div class="novel-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">小说手稿</h1>
        <div class="view-subtitle">
          <span class="muted">最后刷新</span>
          <span class="mono">{{ fmtTime() }}</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn-icon" @click="bumpFont(-1)" title="缩小字号">A-</button>
        <span class="mono muted">{{ fontSize }}px</span>
        <button class="btn-icon" @click="bumpFont(1)" title="放大字号">A+</button>
        <button
          :class="['btn-toggle', { on: showLatestOnly }]"
          @click="showLatestOnly = !showLatestOnly"
        >
          {{ showLatestOnly ? '仅最近 12 段' : '显示全文' }}
        </button>
        <button class="btn-export" @click="exportTxt" :disabled="!paragraphs.length" title="导出为纯文本">.txt</button>
        <button class="btn-export" @click="exportMarkdown" :disabled="!paragraphs.length" title="导出为 Markdown">.md</button>
        <button class="btn-refresh" @click="store.fetchNovelManuscript()">刷新</button>
      </div>
    </header>

    <!-- Manuscript meta card -->
    <section class="card meta-card" v-if="manuscript">
      <div class="meta-grid">
        <div class="meta-block">
          <div class="meta-label">标题</div>
          <div class="meta-value">{{ manuscript.title || '未命名' }}</div>
        </div>
        <div class="meta-block">
          <div class="meta-label">作者</div>
          <div class="meta-value">{{ manuscript.author_name || '林逸' }}</div>
        </div>
        <div class="meta-block">
          <div class="meta-label">版本</div>
          <div class="meta-value mono">v{{ manuscript.version ?? 0 }}</div>
        </div>
        <div class="meta-block">
          <div class="meta-label">段落数</div>
          <div class="meta-value mono">{{ manuscript.paragraph_count ?? 0 }}</div>
        </div>
        <div class="meta-block">
          <div class="meta-label">已发布</div>
          <div class="meta-value mono">{{ manuscript.published_count ?? 0 }}</div>
        </div>
      </div>

      <details class="world-settings" v-if="worldSettings.length" open>
        <summary>世界设定（{{ worldSettings.length }} 项）</summary>
        <dl class="ws-list">
          <template v-for="[k, v] in worldSettings" :key="k">
            <dt>{{ k }}</dt>
            <dd>
              <span v-if="v === null || v === undefined" class="muted">—</span>
              <span v-else-if="Array.isArray(v)" class="mono">{{ v.join(' · ') }}</span>
              <span v-else-if="typeof v === 'object'" class="mono">{{ JSON.stringify(v) }}</span>
              <span v-else class="mono">{{ String(v) }}</span>
            </dd>
          </template>
        </dl>
      </details>
    </section>

    <!-- Latest paragraph highlight -->
    <section class="card latest-card" v-if="manuscript?.latest_paragraph">
      <h2 class="card-title">最近一段</h2>
      <p class="latest-text" :style="{ fontSize: `${fontSize + 2}px` }">
        {{ manuscript.latest_paragraph }}
      </p>
    </section>

    <!-- Empty state -->
    <section class="card empty-card" v-if="!paragraphs.length">
      <div class="empty-icon">∅</div>
      <p class="empty-text">还没有任何段落。等待 CEN 进入创作阶段，或通过控制台触发 <code class="mono">creation.executive.tick</code>。</p>
    </section>

    <!-- Full manuscript reader -->
    <section class="card reader-card" v-if="paragraphs.length">
      <div class="reader-head">
        <h2 class="card-title">正文</h2>
        <span class="muted mono">{{ visibleParagraphs.length }} / {{ paragraphs.length }} 段</span>
      </div>
      <div class="reader-body" :style="{ fontSize: `${fontSize}px` }">
        <p v-for="(p, i) in visibleParagraphs" :key="i" class="paragraph">
          <span class="para-idx mono">{{ i + 1 }}</span>
          <span class="para-text">{{ p }}</span>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.novel-view {
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-icon,
.btn-toggle,
.btn-refresh,
.btn-export {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s var(--ease-out);
}

.btn-icon:hover,
.btn-refresh:hover {
  background: var(--bg-3);
  color: var(--text-primary);
}

.btn-toggle.on {
  background: var(--cen-soft);
  border-color: var(--cen);
  color: var(--cen);
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

.meta-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.meta-block {
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 10px 12px;
}

.meta-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.meta-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.world-settings {
  border-top: 1px solid var(--border-soft);
  padding-top: 12px;
}

.world-settings summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.ws-list {
  display: grid;
  grid-template-columns: max(140px) 1fr;
  gap: 6px 16px;
  margin: 0;
}

.ws-list dt {
  font-size: 12px;
  color: var(--text-muted);
}

.ws-list dd {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
}

.latest-card {
  border-left: 3px solid var(--cen);
}

.latest-text {
  margin: 0;
  line-height: 1.85;
  color: var(--text-primary);
  font-family: 'Source Han Serif SC', 'Songti SC', 'Noto Serif CJK SC', serif;
}

.empty-card {
  text-align: center;
  padding: 40px 16px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 36px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.empty-text {
  margin: 0;
  font-size: 13px;
}

.reader-card {
  display: flex;
  flex-direction: column;
}

.reader-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}

.reader-body {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 8px;
  line-height: 1.9;
  color: var(--text-primary);
  font-family: 'Source Han Serif SC', 'Songti SC', 'Noto Serif CJK SC', serif;
}

.paragraph {
  margin: 0 0 1.2em 0;
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
  align-items: start;
}

.para-idx {
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
  padding-top: 4px;
  font-family: var(--font-mono);
}

.para-text {
  color: var(--text-primary);
  text-indent: 2em;
}

.empty-card code {
  background: var(--bg-3);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
