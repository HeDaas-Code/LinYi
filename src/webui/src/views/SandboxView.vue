<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { CharacterProjection, Scene, SandboxVersion } from '@/types'

// SandboxView (脑中世界) — Phase 4.
//
// Layout:
//   - Top: world model summary + simulation round + depth metrics
//   - Middle left: character projections (with archetype + traits + desires/fears)
//   - Middle right: current scene + narrative line scene list
//   - Bottom: world history (per-round action log) + version tree (A/B forks)
//
// Data source: /api/sandbox/state → MentalSandbox.to_dict()
// Note: PixiJS scene visualization is deferred to a follow-up; we render
// narrative line scenes as a horizontal timeline instead.

const store = useAgentStore()

const sandbox = computed(() => store.sandboxState)
const world = computed(() => sandbox.value?.world_model ?? null)
const characters = computed<CharacterProjection[]>(() => sandbox.value?.characters ?? [])
const currentScene = computed<Scene | null>(() => sandbox.value?.current_scene ?? null)
const narrativeLines = computed(() => sandbox.value?.narrative_lines ?? [])
const currentNarrative = computed(() => narrativeLines.value[narrativeLines.value.length - 1] ?? null)
const versionManager = computed(() => sandbox.value?.version_manager ?? null)
const simulationRound = computed(() => sandbox.value?.simulation_round ?? 0)
const depthMetrics = computed(() => sandbox.value?.depth_metrics ?? null)

const versions = computed<SandboxVersion[]>(() => {
  const tree = versionManager.value?.tree
  if (!tree?.versions) return []
  return Object.values(tree.versions)
})

const currentVersionId = computed(() => versionManager.value?.current_version_id ?? null)

const worldHistory = computed<string[]>(() => {
  const h = world.value?.history
  return Array.isArray(h) ? h.slice(-30).reverse() : []
})

const ontologyFields = computed<Array<[string, unknown]>>(() => {
  const o = world.value?.ontology
  if (!o || typeof o !== 'object') return []
  return Object.entries(o).slice(0, 12)
})

const rules = computed<string[]>(() => {
  const r = world.value?.rules
  return Array.isArray(r) ? r : []
})

const currentState = computed<Array<[string, unknown]>>(() => {
  const s = world.value?.current_state
  if (!s || typeof s !== 'object') return []
  return Object.entries(s).slice(0, 10)
})

function fmtFloat(v: unknown, digits = 2): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  if (!isFinite(n)) return '—'
  return n.toFixed(digits)
}

function traitLabel(key: string): string {
  const map: Record<string, string> = {
    openness: '开放性',
    conscientiousness: '尽责性',
    extraversion: '外向性',
    agreeableness: '宜人性',
    neuroticism: '神经质',
  }
  return map[key] ?? key
}

function sceneTone(level: number): string {
  if (level > 0.7) return 'high'
  if (level > 0.4) return 'mid'
  return 'low'
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!store.sandboxState) {
    store.fetchSandboxState()
  }
  // Sandbox changes slowly; 20s polling is plenty.
  pollTimer = setInterval(() => store.fetchSandboxState(), 20000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="sandbox-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">脑中世界</h1>
        <div class="view-subtitle">
          {{ world?.name ?? '未建构' }} · 模拟轮 {{ simulationRound }} ·
          {{ narrativeLines.length }} 条叙事线 · {{ versions.length }} 个版本
        </div>
      </div>
      <div class="depth-card" v-if="depthMetrics">
        <div class="depth-row">
          <span class="metric-label">冲突深度</span>
          <div class="mini-bar"><div class="mini-fill" :style="{ width: `${((depthMetrics.conflict_depth ?? 0) * 100).toFixed(0)}%` }" /></div>
          <span class="mono">{{ fmtFloat(depthMetrics.conflict_depth) }}</span>
        </div>
        <div class="depth-row">
          <span class="metric-label">人物发展</span>
          <div class="mini-bar"><div class="mini-fill" :style="{ width: `${((depthMetrics.character_development ?? 0) * 100).toFixed(0)}%` }" /></div>
          <span class="mono">{{ fmtFloat(depthMetrics.character_development) }}</span>
        </div>
        <div class="depth-row">
          <span class="metric-label">情感位移</span>
          <div class="mini-bar"><div class="mini-fill" :style="{ width: `${((depthMetrics.emotional_shift ?? 0) * 100).toFixed(0)}%` }" /></div>
          <span class="mono">{{ fmtFloat(depthMetrics.emotional_shift) }}</span>
        </div>
        <div class="depth-row">
          <span class="metric-label">连贯度</span>
          <div class="mini-bar"><div class="mini-fill" :style="{ width: `${((depthMetrics.coherence_score ?? 0) * 100).toFixed(0)}%` }" /></div>
          <span class="mono">{{ fmtFloat(depthMetrics.coherence_score) }}</span>
        </div>
      </div>
    </header>

    <!-- World model summary -->
    <section class="card">
      <h2 class="card-title">世界模型</h2>
      <div class="world-grid" v-if="world">
        <div class="world-col">
          <h3 class="sub-label">本体论</h3>
          <dl class="kv-list">
            <div class="kv-row" v-for="[k, v] in ontologyFields" :key="k">
              <dt>{{ k }}</dt><dd>{{ typeof v === 'object' ? JSON.stringify(v) : v }}</dd>
            </div>
          </dl>
        </div>
        <div class="world-col">
          <h3 class="sub-label">规则</h3>
          <ul class="rule-list">
            <li v-for="(r, i) in rules" :key="i">{{ r }}</li>
          </ul>
        </div>
        <div class="world-col">
          <h3 class="sub-label">当前状态</h3>
          <dl class="kv-list">
            <div class="kv-row" v-for="[k, v] in currentState" :key="k">
              <dt>{{ k }}</dt><dd>{{ typeof v === 'object' ? JSON.stringify(v) : v }}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div class="empty muted" v-else>世界尚未建构。等待 CEN 触发 sandbox.build。</div>
    </section>

    <div class="grid-2">
      <!-- Characters -->
      <section class="card">
        <h2 class="card-title">角色投影（{{ characters.length }}）</h2>
        <ul class="char-list" v-if="characters.length">
          <li v-for="c in characters" :key="c.id" class="char-card">
            <div class="char-head">
              <span class="char-name">{{ c.name }}</span>
              <span class="tag">{{ c.archetype }}</span>
              <span class="muted mono" v-if="typeof c.projection_ratio === 'number'">
                proj {{ (c.projection_ratio * 100).toFixed(0) }}%
              </span>
            </div>
            <div class="char-traits" v-if="c.traits">
              <div class="trait-row" v-for="(v, k) in c.traits" :key="k">
                <span class="trait-label">{{ traitLabel(String(k)) }}</span>
                <div class="trait-bar"><div class="trait-fill" :style="{ width: `${(Number(v) * 100).toFixed(0)}%` }" /></div>
                <span class="mono muted">{{ Number(v).toFixed(2) }}</span>
              </div>
            </div>
            <div class="char-extras">
              <div class="extra-block" v-if="c.desires?.length">
                <span class="extra-label">欲望</span>
                <span class="extra-text">{{ c.desires.join('；') }}</span>
              </div>
              <div class="extra-block" v-if="c.fears?.length">
                <span class="extra-label">恐惧</span>
                <span class="extra-text">{{ c.fears.join('；') }}</span>
              </div>
              <div class="extra-block" v-if="c.internal_conflict">
                <span class="extra-label">内在冲突</span>
                <span class="extra-text">{{ c.internal_conflict }}</span>
              </div>
            </div>
          </li>
        </ul>
        <div class="empty muted" v-else>暂无角色投影。</div>
      </section>

      <!-- Current scene + narrative line -->
      <section class="card">
        <h2 class="card-title">当前场景与叙事线</h2>
        <div class="current-scene" v-if="currentScene">
          <h3 class="sub-label">当前场景</h3>
          <div class="scene-meta">
            <span class="tag" :class="`tone-${sceneTone(currentScene.conflict_level)}`">
              冲突 {{ currentScene.conflict_level.toFixed(2) }}
            </span>
            <span class="tag">情感 {{ currentScene.emotional_tone.toFixed(2) }}</span>
            <span class="muted">{{ currentScene.setting }}</span>
            <span class="muted">{{ currentScene.characters.length }} 角色</span>
          </div>
          <p class="scene-desc">{{ currentScene.description }}</p>
        </div>
        <div class="muted" v-else>当前无活跃场景。</div>

        <h3 class="sub-label" v-if="currentNarrative" style="margin-top: 16px;">
          叙事线 · {{ currentNarrative.id }} · {{ currentNarrative.status }}
        </h3>
        <div class="scene-timeline" v-if="currentNarrative?.scenes?.length">
          <div
            v-for="(s, i) in currentNarrative.scenes"
            :key="s.id"
            class="scene-node"
            :class="`tone-${sceneTone(s.conflict_level)}`"
          >
            <span class="scene-idx mono">{{ i + 1 }}</span>
            <span class="scene-setting">{{ s.setting }}</span>
            <span class="muted">{{ s.characters.length }} 人</span>
          </div>
        </div>

        <h3 class="sub-label" v-if="currentNarrative?.foreshadowing?.length" style="margin-top: 16px;">伏笔</h3>
        <ul class="foreshadow-list" v-if="currentNarrative?.foreshadowing?.length">
          <li v-for="(f, i) in currentNarrative.foreshadowing" :key="i">{{ f }}</li>
        </ul>
      </section>
    </div>

    <!-- World history -->
    <section class="card">
      <h2 class="card-title">世界演进史（最近 {{ worldHistory.length }} 轮）</h2>
      <ul class="history-list" v-if="worldHistory.length">
        <li v-for="(h, i) in worldHistory" :key="i" class="history-row">{{ h }}</li>
      </ul>
      <div class="empty muted" v-else>暂无演进记录。</div>
    </section>

    <!-- A/B version tree -->
    <section class="card" v-if="versions.length">
      <h2 class="card-title">A/B 版本树</h2>
      <div class="version-summary">
        <span class="muted">当前版本：</span>
        <span class="mono">{{ currentVersionId ?? '—' }}</span>
        <span class="muted">· 最大版本数：</span>
        <span class="mono">{{ versionManager?.max_versions ?? '—' }}</span>
      </div>
      <ul class="version-list">
        <li v-for="v in versions" :key="v.id" class="version-row" :class="{ current: v.id === currentVersionId }">
          <span class="v-id mono">{{ v.id }}</span>
          <span class="tag" :class="`status-${v.status}`">{{ v.status }}</span>
          <span class="v-label">{{ v.label }}</span>
          <span class="muted">parent {{ v.parent_id ?? '—' }}</span>
          <span class="muted">round {{ v.simulation_round }}</span>
          <span class="mono muted" v-if="v.metrics">
            {{ Object.entries(v.metrics).map(([k, x]) => `${k}=${Number(x).toFixed(2)}`).join(' ') }}
          </span>
        </li>
      </ul>
    </section>

    <div class="card empty-card" v-if="!store.sandboxState">
      <div class="empty-state">
        <div class="empty-icon">🧠</div>
        <p>脑中世界加载中…</p>
        <p class="muted" v-if="store.lastError">{{ store.lastError }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sandbox-view {
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
  gap: 24px;
  flex-wrap: wrap;
}

.view-title { font-size: 24px; font-weight: 600; margin: 0; color: var(--text-primary); }
.view-subtitle { color: var(--text-muted); font-size: 13px; margin-top: 4px; }

.depth-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  background: var(--bg-2);
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  min-width: 280px;
}

.depth-row {
  display: grid;
  grid-template-columns: 70px 1fr 50px;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.mini-bar {
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
  overflow: hidden;
}

.mini-fill {
  height: 100%;
  background: var(--cen);
  transition: width 0.4s var(--ease-out);
}

.metric-label { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
.mono { font-family: var(--font-mono); font-feature-settings: 'tnum'; color: var(--text-primary); }
.muted { color: var(--text-muted); }

.world-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}

.sub-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}

.kv-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.kv-row {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 8px;
}

.kv-row dt { color: var(--text-muted); font-size: 10px; text-transform: uppercase; }
.kv-row dd { margin: 0; color: var(--text-primary); word-break: break-word; }

.rule-list {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.6;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}

.char-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 600px;
  overflow-y: auto;
}

.char-card {
  padding: 10px 12px;
  background: var(--bg-2);
  border-radius: 6px;
  border-left: 3px solid var(--dmn);
}

.char-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.char-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }

.char-traits {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 6px;
}

.trait-row {
  display: grid;
  grid-template-columns: 60px 1fr 36px;
  gap: 6px;
  align-items: center;
  font-size: 10px;
}

.trait-label { color: var(--text-muted); }

.trait-bar {
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
  overflow: hidden;
}

.trait-fill {
  height: 100%;
  background: var(--dmn);
}

.char-extras {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.extra-block {
  font-size: 11px;
  display: flex;
  gap: 6px;
}

.extra-label {
  color: var(--text-muted);
  flex-shrink: 0;
}

.extra-text {
  color: var(--text-primary);
  line-height: 1.4;
}

.current-scene {
  margin-bottom: 12px;
}

.scene-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  margin-bottom: 6px;
}

.tag.tone-high { background: rgba(248, 113, 113, 0.16); color: var(--error); }
.tag.tone-mid { background: rgba(250, 204, 21, 0.16); color: var(--warn); }
.tag.tone-low { background: var(--bg-3); color: var(--text-secondary); }

.scene-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
}

.scene-timeline {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 4px 0;
}

.scene-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--bg-2);
  border-radius: 6px;
  border-left: 3px solid var(--border);
  min-width: 100px;
  font-size: 11px;
}

.scene-node.tone-high { border-left-color: var(--error); }
.scene-node.tone-mid { border-left-color: var(--warn); }
.scene-node.tone-low { border-left-color: var(--text-muted); }

.scene-idx { font-size: 10px; color: var(--text-muted); }
.scene-setting { color: var(--text-primary); font-size: 12px; }

.foreshadow-list {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.history-row {
  padding: 6px 10px;
  background: var(--bg-2);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.5;
  border-left: 2px solid var(--cen);
}

.version-summary {
  font-size: 12px;
  margin-bottom: 8px;
}

.version-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.version-row {
  display: grid;
  grid-template-columns: 80px 80px 1fr 100px 80px 1fr;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-2);
  border-radius: 4px;
  font-size: 11px;
  border-left: 2px solid var(--border);
}

.version-row.current {
  border-left-color: var(--cen);
  background: var(--cen-soft);
}

.v-id { color: var(--text-secondary); }
.v-label { color: var(--text-primary); }

.tag.status-draft { background: var(--bg-3); color: var(--text-secondary); }
.tag.status-committed { background: rgba(74, 222, 128, 0.16); color: var(--ok); }
.tag.status-abandoned { background: rgba(248, 113, 113, 0.16); color: var(--error); }
.tag.status-merged { background: var(--cen-soft); color: var(--cen); }

.empty { padding: 16px 0; text-align: center; font-size: 12px; }
.empty-card { padding: 40px 20px; }
.empty-state { text-align: center; }
.empty-icon { font-size: 36px; margin-bottom: 8px; }
</style>
