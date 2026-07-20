<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { useAgentStore } from '@/stores/agent'
import DialogueHistory from './DialogueHistory.vue'

// NpcDetails (Phase 3 #22) — right-side panel shown when an NPC is selected.
//
// Mirrors ai-town's PlayerDetails: basic info, relationship state, last-seen
// time, and a tab for encounter history. The "view memory trace" / "view
// related fragments" buttons are stubbed to log only — wiring them to the
// MemoryView filters is a separate task.

const store = useAgentStore()

const props = defineProps<{ npcId: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const detail = computed(() => store.npcDetail)
const npc = computed(() => detail.value?.npc ?? null)
const relationship = computed(() => detail.value?.relationship ?? null)

const activeTab = ref<'history' | 'fragments' | 'traces'>('history')

// Load detail + history whenever the NPC id changes.
watch(
  () => props.npcId,
  (id) => {
    if (!id) return
    store.fetchNpcDetail(id)
    store.fetchNpcHistory(id, 50)
    activeTab.value = 'history'
  },
  { immediate: true },
)

function relTone(type: string): string {
  switch (type) {
    case 'intimate': return 'gold'
    case 'friend': return 'ok'
    case 'acquaintance': return 'cen'
    case 'stranger': return 'neutral'
    case 'rival': return 'warn'
    case 'antagonist': return 'error'
    default: return 'neutral'
  }
}

function archetypeTone(a: string): string {
  switch (a) {
    case 'stranger': return 'neutral'
    case 'regular': return 'dmn'
    case 'authority': return 'sn'
    case 'outsider': return 'cen'
    default: return 'neutral'
  }
}

function fmtTime(ts: number | null): string {
  if (ts === null || ts === undefined) return '从未'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

function intensityTone(v: number): string {
  if (v > 0.3) return 'pos'
  if (v < -0.3) return 'neg'
  return 'neutral'
}

function close() {
  store.clearNpcSelection()
  emit('close')
}

function placeholderAction(label: string) {
  // Stub: in a future iteration this will jump to MemoryView with a filter.
  console.info(`[NpcDetails] ${label} — not yet wired to MemoryView`)
}
</script>

<template>
  <aside class="npc-details" v-if="npcId">
    <header class="details-head">
      <div class="head-row">
        <h2 class="head-title">{{ npc?.name ?? '加载中…' }}</h2>
        <button class="btn-close" @click="close" title="关闭">×</button>
      </div>
      <div class="head-meta" v-if="npc">
        <span class="tag" :class="`arch-${archetypeTone(npc.archetype)}`">{{ npc.archetype }}</span>
        <span class="tag mono">{{ npc.id }}</span>
      </div>
    </header>

    <!-- Loading -->
    <div class="loading" v-if="!detail && store.loading.npcDetail">加载中…</div>

    <!-- Error / not found -->
    <div class="error" v-else-if="!detail">
      <p>无法加载 NPC 详情。</p>
      <p class="muted mono" v-if="store.lastError">{{ store.lastError }}</p>
    </div>

    <div class="details-body" v-else>
      <!-- Basic info -->
      <section class="info-section">
        <h3 class="section-title">基本信息</h3>
        <dl class="info-grid">
          <dt>原型</dt>
          <dd><span class="tag" :class="`arch-${archetypeTone(npc!.archetype)}`">{{ npc!.archetype }}</span></dd>

          <dt>出现空间</dt>
          <dd>
            <span class="tag" v-for="sid in npc!.space_ids" :key="sid">
              {{ store.socialState?.spaces.find(s => s.id === sid)?.name ?? sid }}
            </span>
            <span v-if="!npc!.space_ids.length" class="muted">—</span>
          </dd>

          <dt>初始强度</dt>
          <dd>
            <span :class="['num', `tone-${intensityTone(npc!.initial_intensity)}`]">{{ npc!.initial_intensity.toFixed(2) }}</span>
          </dd>

          <dt>初始信任</dt>
          <dd>
            <span :class="['num', `tone-${intensityTone(npc!.initial_trust)}`]">{{ npc!.initial_trust.toFixed(2) }}</span>
          </dd>

          <dt>重现权重</dt>
          <dd><span class="num">{{ npc!.recurrence_weight.toFixed(2) }}</span></dd>

          <dt>遭遇次数</dt>
          <dd><span class="num mono">{{ detail.encounter_count }}</span></dd>

          <dt>最近见面</dt>
          <dd><span class="mono">{{ fmtTime(detail.last_seen_timestamp) }}</span></dd>
        </dl>
      </section>

      <!-- Relationship -->
      <section class="info-section" v-if="relationship">
        <h3 class="section-title">关系状态</h3>
        <div class="rel-grid">
          <div class="rel-block">
            <div class="rel-label">类型</div>
            <span class="tag" :class="`rel-${relTone(relationship.type)}`">{{ relationship.type }}</span>
          </div>
          <div class="rel-block">
            <div class="rel-label">强度</div>
            <div class="rel-bar">
              <div class="rel-fill" :class="`tone-${intensityTone(relationship.intensity)}`" :style="{ width: `${Math.abs(relationship.intensity) * 100}%` }" />
            </div>
            <span class="num mono">{{ relationship.intensity.toFixed(2) }}</span>
          </div>
          <div class="rel-block">
            <div class="rel-label">信任</div>
            <div class="rel-bar">
              <div class="rel-fill" :class="`tone-${intensityTone(relationship.trust)}`" :style="{ width: `${Math.abs(relationship.trust) * 100}%` }" />
            </div>
            <span class="num mono">{{ relationship.trust.toFixed(2) }}</span>
          </div>
        </div>

        <details class="history-list" v-if="relationship.history.length" open>
          <summary>关系演化摘要（{{ relationship.history.length }}）</summary>
          <ol class="rel-history">
            <li v-for="(h, i) in relationship.history" :key="i" class="rel-h-item">
              <span class="mono muted">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="rel-h-text">{{ h }}</span>
            </li>
          </ol>
        </details>
      </section>

      <section class="info-section" v-else>
        <h3 class="section-title">关系状态</h3>
        <p class="muted">尚无关系记录。等待遭遇事件产生 relationship_delta。</p>
      </section>

      <!-- Action buttons -->
      <section class="info-section actions">
        <button class="btn-action" @click="placeholderAction('fragments')">查看相关碎片</button>
        <button class="btn-action" @click="placeholderAction('traces')">查看记忆痕迹</button>
      </section>

      <!-- Tabs -->
      <section class="info-section tabs-section">
        <div class="tab-bar">
          <button
            :class="['tab', { active: activeTab === 'history' }]"
            @click="activeTab = 'history'"
          >对话历史</button>
          <button
            :class="['tab', { active: activeTab === 'fragments' }]"
            @click="activeTab = 'fragments'"
          >碎片</button>
          <button
            :class="['tab', { active: activeTab === 'traces' }]"
            @click="activeTab = 'traces'"
          >痕迹</button>
        </div>

        <div class="tab-body">
          <DialogueHistory v-if="activeTab === 'history'" :npc-id="npcId" />
          <div v-else class="tab-placeholder">
            <p class="muted">该 tab 由后续任务接入 MemoryView 数据。</p>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.npc-details {
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  height: 100%;
  min-height: 400px;
  overflow: hidden;
}

.details-head {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-2);
}

.head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.head-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 22px;
  line-height: 1;
  padding: 0 6px;
  cursor: pointer;
  border-radius: 4px;
}

.btn-close:hover {
  color: var(--text-primary);
  background: var(--bg-3);
}

.head-meta {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.tag {
  display: inline-block;
  padding: 2px 8px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 11px;
  color: var(--text-secondary);
}

.mono { font-family: var(--font-mono); color: var(--text-primary); }
.muted { color: var(--text-muted); font-size: 12px; }

.tag.arch-neutral { background: var(--bg-3); color: var(--text-secondary); }
.tag.arch-dmn { background: var(--dmn-soft); color: var(--dmn); border-color: var(--dmn); }
.tag.arch-sn { background: var(--sn-soft); color: var(--sn); border-color: var(--sn); }
.tag.arch-cen { background: var(--cen-soft); color: var(--cen); border-color: var(--cen); }

.tag.rel-gold { background: rgba(212, 175, 55, 0.18); color: #d4af37; border-color: #d4af37; }
.tag.rel-ok { background: rgba(74, 222, 128, 0.16); color: var(--ok); border-color: var(--ok); }
.tag.rel-cen { background: var(--cen-soft); color: var(--cen); border-color: var(--cen); }
.tag.rel-neutral { background: var(--bg-3); color: var(--text-secondary); }
.tag.rel-warn { background: rgba(250, 204, 21, 0.16); color: var(--warn); border-color: var(--warn); }
.tag.rel-error { background: rgba(248, 113, 113, 0.16); color: var(--error); border-color: var(--error); }

.loading, .error {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.error p { margin: 4px 0; }

.details-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin: 0 0 6px 0;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-soft);
}

.info-grid {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 8px 12px;
  margin: 0;
  font-size: 12px;
}

.info-grid dt {
  color: var(--text-muted);
}

.info-grid dd {
  margin: 0;
  color: var(--text-primary);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.num {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
  color: var(--text-primary);
}

.tone-pos { color: var(--ok); }
.tone-neg { color: var(--error); }
.tone-neutral { color: var(--text-secondary); }

.rel-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rel-block {
  display: grid;
  grid-template-columns: 50px 1fr 50px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.rel-label {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
}

.rel-bar {
  height: 5px;
  background: var(--bg-3);
  border-radius: 3px;
  overflow: hidden;
}

.rel-fill {
  height: 100%;
  transition: width 0.4s var(--ease-out);
}

.rel-fill.tone-pos { background: var(--ok); }
.rel-fill.tone-neg { background: var(--error); }
.rel-fill.tone-neutral { background: var(--text-muted); }

.history-list summary {
  cursor: pointer;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.rel-history {
  margin: 8px 0 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.rel-h-item {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.rel-h-text {
  color: var(--text-primary);
}

.actions {
  flex-direction: row;
  gap: 8px;
}

.btn-action {
  padding: 5px 12px;
  font-size: 11px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
}

.btn-action:hover {
  background: var(--bg-3);
  color: var(--text-primary);
  border-color: var(--cen);
}

.tabs-section {
  flex: 1;
  min-height: 200px;
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border-soft);
  margin-bottom: 8px;
}

.tab {
  padding: 6px 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s var(--ease-out);
}

.tab:hover {
  color: var(--text-secondary);
}

.tab.active {
  color: var(--cen);
  border-bottom-color: var(--cen);
}

.tab-body {
  min-height: 200px;
}

.tab-placeholder {
  padding: 20px;
  text-align: center;
}
</style>
