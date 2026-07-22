<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { SocialSpace, SocialNPC, SocialEncounter } from '@/types'
import NpcDetails from '@/components/NpcDetails.vue'
import SpaceSelector from '@/components/social/SpaceSelector.vue'
import PixiCanvas from '@/components/social/PixiCanvas.vue'
import GazeOverlay from '@/components/social/GazeOverlay.vue'

// SocialView (社会空间) — Phase 3.
//
// Layout (PixiJS pixel-map):
//   - Top: current space + role + social energy bar + accumulated gaze load
//   - SpaceSelector (5 spaces) + PixiCanvas pixel-map with GazeOverlay
//   - grid-2: NPC list (left) + gaze pressures (right)
//   - Bottom: recent encounters timeline with valence marker + dialogue mode
//   - Side drawer (Phase 3 #22): NpcDetails panel when an NPC is clicked
//
// Data source: /api/social/state → SocialInput.visualize_state()
// Tilemap assets: /assets/tilemaps/{spaceId}/tilemap.json + tileset.png

const store = useAgentStore()

const selectedNpcId = ref<string | null>(null)
const selectedSpaceId = ref<string>('')
const pixiLoading = ref(false)

const current = computed(() => store.socialState?.current ?? null)
const spaces = computed<SocialSpace[]>(() => store.socialState?.spaces ?? [])
const npcs = computed<SocialNPC[]>(() => store.socialState?.npcs ?? [])
const relationships = computed(() => store.socialState?.relationships ?? [])
const gazePressures = computed(() => store.socialState?.gaze_pressures ?? [])
const encounters = computed<SocialEncounter[]>(() => store.socialState?.recent_encounters ?? [])

const currentSpaceId = computed(() => current.value?.space?.id ?? '')
const socialEnergy = computed(() => current.value?.social_energy ?? 0)
const gazeLoad = computed(() => current.value?.accumulated_gaze_load ?? 0)

const energyPct = computed(() => `${Math.max(0, Math.min(100, socialEnergy.value)).toFixed(0)}%`)
const energyTone = computed(() => {
  if (socialEnergy.value < 20) return 'low'
  if (socialEnergy.value < 50) return 'mid'
  return 'high'
})
const gazePct = computed(() => `${(Math.max(0, Math.min(1, gazeLoad.value)) * 100).toFixed(0)}%`)

// PixiCanvas integration:
//   - selectedSpace: derived from selectedSpaceId (defaults to current space
//     on mount); drives which tilemap is rendered.
//   - npcsInSelectedSpace: NPCs that appear in the selected space — passed
//     to PixiCanvas for sprite rendering.
//   - linyiX/Y: pixel coords for 林逸's sprite on the tilemap. Centered for
//     now; future work can read these from the agent state.
const selectedSpace = computed<SocialSpace | null>(() =>
  spaces.value.find((s) => s.id === selectedSpaceId.value) ?? null,
)
const npcsInSelectedSpace = computed<SocialNPC[]>(() =>
  npcs.value.filter((n) => npcInSpace(n, selectedSpaceId.value)),
)
const linyiX = computed(() => 200)
const linyiY = computed(() => 150)

function spaceTone(t: string): string {
  switch (t) {
    case 'public': return 'sn'
    case 'private': return 'dmn'
    case 'liminal': return 'cen'
    case 'sacred': return 'gold'
    case 'marginal': return 'warn'
    default: return 'neutral'
  }
}

function npcInSpace(npc: SocialNPC, spaceId: string): boolean {
  return npc.space_ids.includes(spaceId)
}

function relationshipFor(npcId: string) {
  return relationships.value.find((r) => r.target_id === npcId)
}

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

function fmtTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

function encounterTone(t: string): string {
  switch (t) {
    case 'conflict': return 'error'
    case 'help_request': return 'cen'
    case 'reunion': return 'gold'
    case 'eavesdrop': return 'neutral'
    case 'chance':
    default: return 'dmn'
  }
}

function valenceColor(v: number): string {
  if (v > 0.3) return 'var(--ok)'
  if (v < -0.3) return 'var(--error)'
  return 'var(--text-muted)'
}

function selectNpc(npcId: string) {
  selectedNpcId.value = npcId
}

function closeNpcPanel() {
  selectedNpcId.value = null
}

function onSpaceChange(spaceId: string) {
  selectedSpaceId.value = spaceId
  // Pre-fetch the tilemap JSON into the store so the loading banner shows
  // immediately; the PixiCanvas component will independently load the
  // tileset.png + spritesheets in parallel.
  pixiLoading.value = true
  store.fetchSocialMap(spaceId).finally(() => {
    pixiLoading.value = false
  })
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!store.socialState) {
    store.fetchSocialState().then(() => {
      if (currentSpaceId.value) {
        onSpaceChange(currentSpaceId.value)
      } else if (spaces.value.length) {
        // Fallback: pick the first space if no current space is reported.
        onSpaceChange(spaces.value[0].id)
      }
    })
  } else if (currentSpaceId.value) {
    onSpaceChange(currentSpaceId.value)
  } else if (spaces.value.length) {
    onSpaceChange(spaces.value[0].id)
  }
  // Social encounters happen on phase changes (social phase 12:00-14:00);
  // 15s polling is plenty.
  pollTimer = setInterval(() => store.fetchSocialState(), 15000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="social-view" :class="`tone-${spaceTone(selectedSpace?.space_type ?? '')}`">
    <header class="view-header">
      <div>
        <h1 class="view-title">社会空间</h1>
        <div class="view-subtitle">
          5 个空间 · {{ npcs.length }} NPC · {{ relationships.length }} 关系 · {{ encounters.length }} 遭遇
        </div>
      </div>
      <div class="status-card" v-if="current">
        <div class="status-row">
          <span class="metric-label">当前空间</span>
          <span class="status-value">{{ current.space?.name ?? '—' }}</span>
        </div>
        <div class="status-row">
          <span class="metric-label">当前角色</span>
          <span class="status-value">{{ current.role?.name ?? '—' }}</span>
        </div>
        <div class="status-row">
          <span class="metric-label">社交能量</span>
          <div class="energy-bar">
            <div class="energy-fill" :class="`tone-${energyTone}`" :style="{ width: energyPct }" />
          </div>
          <span class="mono">{{ energyPct }}</span>
        </div>
        <div class="status-row">
          <span class="metric-label">凝视负荷</span>
          <div class="energy-bar">
            <div class="energy-fill tone-warn" :style="{ width: gazePct }" />
          </div>
          <span class="mono">{{ gazePct }}</span>
        </div>
      </div>
    </header>

    <div class="layout-with-panel" :class="{ 'panel-open': !!selectedNpcId }">
      <div class="main-col">
        <!-- Space selector: 5 space tabs, drives PixiCanvas -->
        <SpaceSelector
          :spaces="spaces"
          :current-space-id="selectedSpaceId"
          @change="onSpaceChange"
        />

        <!-- PixiCanvas pixel-map with GazeOverlay + loading banner -->
        <div class="pixi-wrapper">
          <PixiCanvas
            v-if="selectedSpace"
            :space-id="selectedSpace.id"
            :space="selectedSpace"
            :npcs="npcsInSelectedSpace"
            :current-npc-id="selectedNpcId"
            :linyi-x="linyiX"
            :linyi-y="linyiY"
            @select-npc="selectNpc"
          />
          <GazeOverlay :gaze-intensity="selectedSpace?.gaze_intensity ?? 0" />
          <div class="pixi-loading" v-if="pixiLoading">地图加载中…</div>
          <div class="pixi-hint muted" v-if="!selectedSpace">请选择空间</div>
        </div>

        <div class="grid-2">
          <!-- NPCs + relationships -->
          <section class="card">
            <h2 class="card-title">NPC 与关系 <span class="hint muted">（点击查看详情）</span></h2>
            <ul class="npc-list" v-if="npcs.length">
              <li
                v-for="npc in npcs"
                :key="npc.id"
                :class="['npc-row', { selected: selectedNpcId === npc.id }]"
                @click="selectNpc(npc.id)"
              >
                <div class="npc-head">
                  <span class="npc-name">{{ npc.name }}</span>
                  <span class="tag" :class="`arch-${npc.archetype}`">{{ npc.archetype }}</span>
                </div>
                <div class="npc-spaces muted">
                  {{ npc.space_ids.map(id => spaces.find(s => s.id === id)?.name ?? id).join(' · ') }}
                </div>
                <div class="npc-rel" v-if="relationshipFor(npc.id)">
                  <span class="tag" :class="`rel-${relTone(relationshipFor(npc.id)!.type)}`">
                    {{ relationshipFor(npc.id)!.type }}
                  </span>
                  <span class="mono muted">
                    i {{ relationshipFor(npc.id)!.intensity.toFixed(2) }}
                    · t {{ relationshipFor(npc.id)!.trust.toFixed(2) }}
                  </span>
                </div>
              </li>
            </ul>
            <div class="empty muted" v-else>暂无 NPC。</div>
          </section>

          <!-- Gaze pressures -->
          <section class="card" v-if="gazePressures.length">
            <h2 class="card-title">凝视压力（最近 {{ gazePressures.length }} 条）</h2>
            <ul class="gaze-list">
              <li v-for="(g, i) in gazePressures.slice(0, 10)" :key="i" class="gaze-row">
                <span class="gaze-src">{{ g.source }}</span>
                <span class="muted">·</span>
                <span class="gaze-norm">{{ g.norm }}</span>
                <div class="gaze-bar">
                  <div class="gaze-fill" :style="{ width: `${Math.min(100, g.intensity * 100).toFixed(0)}%` }" />
                </div>
                <span class="mono">{{ g.intensity.toFixed(2) }}</span>
                <span class="tag" v-if="g.internalized > 0.5">internalized</span>
              </li>
            </ul>
          </section>
        </div>

        <!-- Encounter timeline -->
        <section class="card">
          <h2 class="card-title">遭遇时间线</h2>
          <ul class="encounter-list" v-if="encounters.length">
            <li v-for="e in encounters.slice(0, 30)" :key="e.id" class="encounter-row">
              <span class="enc-marker" :style="{ background: valenceColor(e.valence) }" />
              <div class="enc-body">
                <div class="enc-meta">
                  <span class="mono">{{ fmtTime(e.timestamp) }}</span>
                  <span class="tag" :class="`enc-${encounterTone(e.encounter_type)}`">{{ e.encounter_type }}</span>
                  <span class="tag">{{ e.dialogue_mode }}</span>
                  <span class="muted">{{ spaces.find(s => s.id === e.space_id)?.name ?? e.space_id }}</span>
                  <span class="muted" v-if="e.participants.length">{{ e.participants.length }} 人</span>
                  <span class="muted">v {{ e.valence.toFixed(2) }}</span>
                  <span class="muted">gaze {{ e.gaze_pressure.toFixed(2) }}</span>
                </div>
                <div class="enc-text">{{ e.content }}</div>
                <div class="enc-foot" v-if="e.relationship_delta">
                  <span class="muted">关系变化：</span>
                  <span class="mono">{{ e.relationship_delta.target_name }} ({{ e.relationship_delta.type }}) Δ {{ e.relationship_delta.delta.toFixed(2) }}</span>
                  <button
                    v-if="e.relationship_delta.target_id"
                    class="link-btn"
                    @click.stop="selectNpc(e.relationship_delta!.target_id)"
                  >查看 NPC</button>
                </div>
              </div>
            </li>
          </ul>
          <div class="empty muted" v-else>暂无遭遇记录。</div>
        </section>
      </div>

      <!-- Side drawer: NPC details panel -->
      <aside class="side-panel" v-if="selectedNpcId">
        <NpcDetails :npc-id="selectedNpcId" @close="closeNpcPanel" />
      </aside>
    </div>

    <div class="card empty-card" v-if="!store.socialState">
      <div class="empty-state">
        <div class="empty-icon">🌐</div>
        <p>社会空间数据加载中…</p>
        <p class="muted" v-if="store.lastError">{{ store.lastError }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.social-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.layout-with-panel {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}

.layout-with-panel.panel-open {
  grid-template-columns: 1fr 380px;
}

.main-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* PixiCanvas pixel-map wrapper — sits between SpaceSelector and grid-2. */
.pixi-wrapper {
  position: relative;
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  overflow: hidden;
  height: 480px;
  min-width: 0;
}
.pixi-loading,
.pixi-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  color: var(--text-muted);
  pointer-events: none;
  background: rgba(10, 13, 20, 0.7);
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  z-index: 2;
}

.side-panel {
  position: sticky;
  top: 16px;
  max-height: calc(100vh - var(--topbar-height) - 32px);
}

.hint {
  font-size: 10px;
  font-weight: 400;
  margin-left: 8px;
}

.npc-row {
  cursor: pointer;
  transition: background 0.12s var(--ease-out), border-color 0.12s var(--ease-out);
  border: 1px solid transparent;
}

.npc-row:hover {
  background: var(--bg-3);
}

.npc-row.selected {
  background: var(--cen-soft);
  border-color: var(--cen);
}

.link-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--cen);
  padding: 1px 8px;
  font-size: 10px;
  border-radius: 10px;
  cursor: pointer;
  margin-left: 8px;
}

.link-btn:hover {
  background: var(--cen-soft);
}

@media (max-width: 900px) {
  .layout-with-panel.panel-open {
    grid-template-columns: 1fr;
  }
  .side-panel {
    position: static;
    max-height: none;
  }
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

.status-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-2);
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  min-width: 280px;
}

.status-row {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.status-value { color: var(--text-primary); font-size: 13px; }

.energy-bar {
  height: 6px;
  background: var(--bg-3);
  border-radius: 3px;
  overflow: hidden;
  min-width: 80px;
}

.energy-fill {
  height: 100%;
  transition: width 0.4s var(--ease-out);
}

.energy-fill.tone-high { background: var(--ok); }
.energy-fill.tone-mid { background: var(--warn); }
.energy-fill.tone-low { background: var(--error); }
.energy-fill.tone-warn { background: var(--warn); }

.metric-label {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.mono { font-family: var(--font-mono); font-feature-settings: 'tnum'; color: var(--text-primary); }
.muted { color: var(--text-muted); }

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}

.space-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.space-card {
  padding: 10px 12px;
  background: var(--bg-2);
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  border-left: 3px solid var(--border);
}

.space-card.active {
  background: var(--bg-3);
  border-color: var(--cen);
  border-left-color: var(--cen);
}

.space-card.tone-sn { border-left-color: var(--sn); }
.space-card.tone-dmn { border-left-color: var(--dmn); }
.space-card.tone-cen { border-left-color: var(--cen); }
.space-card.tone-gold { border-left-color: #d4af37; }
.space-card.tone-warn { border-left-color: var(--warn); }

.space-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.space-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }

.space-stats {
  display: flex;
  gap: 8px;
  font-size: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.space-norms {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.norm {
  font-size: 10px;
  color: var(--text-secondary);
  padding-left: 6px;
  border-left: 1px solid var(--border);
}

.tag.tone-sn { background: var(--sn-soft); color: var(--sn); border-color: var(--sn); }
.tag.tone-dmn { background: var(--dmn-soft); color: var(--dmn); border-color: var(--dmn); }
.tag.tone-cen { background: var(--cen-soft); color: var(--cen); border-color: var(--cen); }
.tag.tone-gold { background: rgba(212, 175, 55, 0.18); color: #d4af37; border-color: #d4af37; }
.tag.tone-warn { background: rgba(250, 204, 21, 0.16); color: var(--warn); border-color: var(--warn); }
.tag.tone-neutral { background: var(--bg-3); color: var(--text-secondary); }

.tag.arch-stranger { background: var(--bg-3); color: var(--text-secondary); }
.tag.arch-regular { background: var(--dmn-soft); color: var(--dmn); }
.tag.arch-authority { background: var(--sn-soft); color: var(--sn); }
.tag.arch-outsider { background: rgba(58, 76, 130, 0.24); color: #aab7e6; }

.tag.rel-ok { background: rgba(74, 222, 128, 0.16); color: var(--ok); }
.tag.rel-gold { background: rgba(212, 175, 55, 0.18); color: #d4af37; }
.tag.rel-cen { background: var(--cen-soft); color: var(--cen); }
.tag.rel-neutral { background: var(--bg-3); color: var(--text-secondary); }
.tag.rel-warn { background: rgba(250, 204, 21, 0.16); color: var(--warn); }
.tag.rel-error { background: rgba(248, 113, 113, 0.16); color: var(--error); }

.tag.enc-error { background: rgba(248, 113, 113, 0.16); color: var(--error); }
.tag.enc-cen { background: var(--cen-soft); color: var(--cen); }
.tag.enc-gold { background: rgba(212, 175, 55, 0.18); color: #d4af37; }
.tag.enc-neutral { background: var(--bg-3); color: var(--text-secondary); }
.tag.enc-dmn { background: var(--dmn-soft); color: var(--dmn); }

.npc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 420px;
  overflow-y: auto;
}

.npc-row {
  padding: 8px 12px;
  background: var(--bg-2);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.npc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.npc-name { font-size: 13px; color: var(--text-primary); }

.npc-spaces { font-size: 10px; }

.npc-rel {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
}

.gaze-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gaze-row {
  display: grid;
  grid-template-columns: 100px 1fr 100px 60px auto;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-2);
  border-radius: 4px;
  font-size: 11px;
}

.gaze-src { color: var(--text-primary); }
.gaze-norm { color: var(--text-secondary); }

.gaze-bar {
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
  overflow: hidden;
}

.gaze-fill {
  height: 100%;
  background: var(--warn);
  transition: width 0.4s var(--ease-out);
}

.encounter-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 600px;
  overflow-y: auto;
}

.encounter-row {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-1);
  border-radius: 6px;
  border: 1px solid var(--border-soft);
}

.enc-marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  box-shadow: 0 0 6px currentColor;
}

.enc-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.enc-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--text-muted);
}

.enc-meta .mono { color: var(--text-secondary); }

.enc-text {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.6;
}

.enc-foot { font-size: 11px; }

.empty { padding: 16px 0; text-align: center; font-size: 12px; }

.empty-card { padding: 40px 20px; }
.empty-state { text-align: center; }
.empty-icon { font-size: 36px; margin-bottom: 8px; }
</style>
