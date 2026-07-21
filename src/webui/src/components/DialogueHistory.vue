<script setup lang="ts">
import { computed } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { SocialEncounter } from '@/types'

// DialogueHistory (Phase 3 #22) — encounter list filtered by NPC.
//
// Mirrors ai-town's Messages component, but LinYi is an observer: there are
// no live two-AI conversations. Instead, we render the SocialEncounter
// history in reverse chronological order, with the dialogue_mode tag and
// relationship delta per row. The "content" field is the narrative text
// (which may include identity-flavored inner monologue marked with （…）
// or ［…］ parens — we visually distinguish those via a regex).

const props = defineProps<{ npcId: string }>()

const store = useAgentStore()

const encounters = computed<SocialEncounter[]>(() => store.npcHistory?.encounters ?? [])
const npcName = computed(() => {
  const npc = store.socialState?.npcs.find(n => n.id === props.npcId)
  return npc?.name ?? props.npcId
})

interface EncSegment {
  kind: 'narration' | 'monologue' | 'value'
  text: string
}

function parseSegments(content: string): EncSegment[] {
  // Identity-core flavor markers (see _apply_constraints in social_input.py):
  //   （…）  — interest-prism monologue
  //   ［…］  — value-marker
  // We split content on these markers so the UI can italicize monologue
  // segments and tint value markers.
  const segs: EncSegment[] = []
  if (!content) return segs
  const re = /([（(][^）)]*[）)])|([［\[][^\]］]*[\]］])/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      segs.push({ kind: 'narration', text: content.slice(last, m.index) })
    }
    const piece = m[0]
    const kind: EncSegment['kind'] = piece.startsWith('（') || piece.startsWith('(')
      ? 'monologue'
      : 'value'
    segs.push({ kind, text: piece })
    last = m.index + piece.length
  }
  if (last < content.length) {
    segs.push({ kind: 'narration', text: content.slice(last) })
  }
  return segs
}

function fmtTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    second: '2-digit',
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

function dialogueTone(m: string): string {
  switch (m) {
    case 'surface': return 'neutral'
    case 'probe': return 'cen'
    case 'confessional': return 'gold'
    default: return 'neutral'
  }
}

function valenceTone(v: number): string {
  if (v > 0.3) return 'pos'
  if (v < -0.3) return 'neg'
  return 'neutral'
}

function spaceName(id: string): string {
  return store.socialState?.spaces.find(s => s.id === id)?.name ?? id
}
</script>

<template>
  <div class="dialogue-history">
    <div class="dh-head">
      <span class="dh-title">与 {{ npcName }} 的对话历史</span>
      <span class="muted mono">{{ encounters.length }} 条</span>
    </div>

    <div v-if="!encounters.length" class="empty">
      <p>暂无遭遇记录。</p>
      <p class="muted">
        注意：eavesdrop / intrusion 类型遭遇没有 target_id，无法归到该 NPC。
      </p>
    </div>

    <ul v-else class="dh-list">
      <li v-for="e in encounters" :key="e.id" class="dh-item">
        <div class="dh-meta">
          <span class="mono">{{ fmtTime(e.timestamp) }}</span>
          <span class="tag" :class="`enc-${encounterTone(e.encounter_type)}`">{{ e.encounter_type }}</span>
          <span class="tag" :class="`dm-${dialogueTone(e.dialogue_mode)}`">{{ e.dialogue_mode }}</span>
          <span class="muted">{{ spaceName(e.space_id) }}</span>
          <span class="muted" v-if="e.participants.length">
            {{ e.participants.length }} 人
          </span>
          <span :class="['valence', `tone-${valenceTone(e.valence)}`]" :title="`valence ${e.valence.toFixed(2)}`">
            v {{ e.valence.toFixed(2) }}
          </span>
          <span class="muted" title="gaze pressure">gaze {{ e.gaze_pressure.toFixed(2) }}</span>
        </div>

        <div class="dh-content">
          <template v-for="(seg, i) in parseSegments(e.content)" :key="i">
            <span v-if="seg.kind === 'narration'" class="seg-narration">{{ seg.text }}</span>
            <em v-else-if="seg.kind === 'monologue'" class="seg-monologue">{{ seg.text }}</em>
            <span v-else class="seg-value">{{ seg.text }}</span>
          </template>
        </div>

        <div class="dh-foot">
          <div class="dh-cost" v-if="e.cost">
            <span class="muted">成本：</span>
            <span class="mono" v-if="e.cost.energy_drain">能量 {{ e.cost.energy_drain.toFixed(2) }}</span>
            <span class="mono" v-if="e.cost.attention_drain">注意 {{ e.cost.attention_drain.toFixed(2) }}</span>
            <span class="mono" v-if="e.cost.emotional_exposure">情绪 {{ e.cost.emotional_exposure.toFixed(2) }}</span>
          </div>
          <div class="dh-delta" v-if="e.relationship_delta">
            <span class="muted">关系变化：</span>
            <span class="mono" :class="`tone-${valenceTone(e.relationship_delta.delta)}`">
              {{ e.relationship_delta.target_name }} ({{ e.relationship_delta.type }})
              Δ {{ e.relationship_delta.delta.toFixed(2) }}
            </span>
          </div>
          <div class="dh-tags" v-if="e.tags.length">
            <span class="tag" v-for="t in e.tags" :key="t">{{ t }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.dialogue-history {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dh-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4px 0;
}

.dh-title {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.muted { color: var(--text-muted); font-size: 11px; }
.mono { font-family: var(--font-mono); font-feature-settings: 'tnum'; color: var(--text-primary); }

.empty {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.empty p { margin: 4px 0; }

.dh-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.dh-item {
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dh-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--text-muted);
  flex-wrap: wrap;
}

.dh-meta .mono { color: var(--text-secondary); font-size: 11px; }

.tag {
  display: inline-block;
  padding: 1px 6px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 10px;
  color: var(--text-secondary);
}

.tag.enc-error { background: rgba(248, 113, 113, 0.16); color: var(--error); }
.tag.enc-cen { background: var(--cen-soft); color: var(--cen); }
.tag.enc-gold { background: rgba(212, 175, 55, 0.18); color: #d4af37; }
.tag.enc-neutral { background: var(--bg-3); color: var(--text-secondary); }
.tag.enc-dmn { background: var(--dmn-soft); color: var(--dmn); }

.tag.dm-neutral { background: var(--bg-3); color: var(--text-secondary); }
.tag.dm-cen { background: var(--cen-soft); color: var(--cen); }
.tag.dm-gold { background: rgba(212, 175, 55, 0.18); color: #d4af37; }

.valence {
  font-family: var(--font-mono);
  font-size: 10px;
}

.tone-pos { color: var(--ok); }
.tone-neg { color: var(--error); }
.tone-neutral { color: var(--text-secondary); }

.dh-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  font-family: 'Source Han Serif SC', 'Songti SC', 'Noto Serif CJK SC', serif;
}

.seg-narration {
  color: var(--text-primary);
}

.seg-monologue {
  color: var(--dmn);
  font-style: italic;
  opacity: 0.92;
}

.seg-value {
  color: #d4af37;
  font-weight: 500;
  font-size: 0.95em;
}

.dh-foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
}

.dh-cost, .dh-delta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.dh-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
</style>
