<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAgentStore } from '@/stores/agent'

// IdentityView (人格画像) — the LinYi profile page.
//
// Mirrors docs/WEBUI-REFACTOR.md §4.3 Phase 1 layout:
//   - Left column: traits radar (placeholder SVG) + integrity score
//   - Right column: self-narrative, values, interests, voice signature,
//     internal conflict, current novel
//   - Bottom: habits / anchors / rhythm preferences
//
// Phase 1 uses pure SVG for the radar; D3.js will be wired in Phase 2 when
// we add identity history (trait evolution timeline).

const store = useAgentStore()

const profile = computed(() => store.profile)

const traits = computed<Array<{ name: string; value: number }>>(() => {
  const t = profile.value?.traits
  if (!t) return []
  return Object.entries(t).map(([name, value]) => ({ name, value }))
})

const maxTrait = computed(() =>
  traits.value.reduce((m, t) => Math.max(m, t.value), 5),
)

// Radar geometry — 200px square, centered at (110, 110), radius 90.
const RADAR_CX = 110
const RADAR_CY = 110
const RADAR_R = 90

const radarPoints = computed(() => {
  const ts = traits.value
  if (ts.length < 3) return ''
  const n = ts.length
  return ts
    .map((t, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const r = (Math.max(0, Math.min(5, t.value)) / Math.max(1, maxTrait.value)) * RADAR_R
      const x = RADAR_CX + Math.cos(angle) * r
      const y = RADAR_CY + Math.sin(angle) * r
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
})

const radarAxes = computed(() => {
  const ts = traits.value
  if (ts.length < 3) return []
  const n = ts.length
  return ts.map((t, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    return {
      name: t.name,
      x: RADAR_CX + Math.cos(angle) * RADAR_R,
      y: RADAR_CY + Math.sin(angle) * RADAR_R,
    }
  })
})

const integrityTone = computed(() => {
  const v = profile.value?.integrity_score ?? 0
  if (v >= 0.8) return 'ok'
  if (v >= 0.5) return 'warn'
  return 'error'
})

const rhythmLabel = computed(() => {
  const r = profile.value?.rhythm_preferences
  if (!r) return null
  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`
  return {
    writing: (r.preferred_writing_hours || []).map(fmt).join('、'),
    sleep: `${fmt(r.sleep_start)} – ${fmt(r.wake_up)}`,
    meals: (r.meal_times || []).map(fmt).join('、'),
    peak: fmt(r.peak_energy),
  }
})

onMounted(() => {
  if (!store.identity) {
    store.fetchIdentity()
  }
  store.fetchIdentityHistory()
})
</script>

<template>
  <div class="identity-view" v-if="profile">
    <header class="view-header">
      <div>
        <h1 class="view-title">{{ profile.name }}</h1>
        <div class="view-subtitle">笔名 · {{ profile.pen_name }}</div>
      </div>
      <div class="integrity-card" :class="`tone-${integrityTone}`">
        <span class="metric-label">完整性</span>
        <span class="integrity-value">{{ ((profile.integrity_score ?? 0) * 100).toFixed(0) }}%</span>
      </div>
    </header>

    <div class="identity-grid">
      <!-- Left column: traits radar -->
      <section class="card radar-card">
        <h2 class="card-title">人格特质</h2>
        <svg viewBox="0 0 220 220" class="radar" v-if="traits.length >= 3">
          <!-- Concentric grid -->
          <circle :cx="RADAR_CX" :cy="RADAR_CY" :r="RADAR_R * 0.25" class="grid-ring" />
          <circle :cx="RADAR_CX" :cy="RADAR_CY" :r="RADAR_R * 0.5" class="grid-ring" />
          <circle :cx="RADAR_CX" :cy="RADAR_CY" :r="RADAR_R * 0.75" class="grid-ring" />
          <circle :cx="RADAR_CX" :cy="RADAR_CY" :r="RADAR_R" class="grid-ring outer" />

          <!-- Axes -->
          <line
            v-for="(a, i) in radarAxes"
            :key="`axis-${i}`"
            :x1="RADAR_CX"
            :y1="RADAR_CY"
            :x2="a.x"
            :y2="a.y"
            class="grid-axis"
          />

          <!-- Trait polygon -->
          <polygon :points="radarPoints" class="trait-poly" />

          <!-- Trait labels -->
          <text
            v-for="(a, i) in radarAxes"
            :key="`label-${i}`"
            :x="a.x + (a.x - RADAR_CX) * 0.08"
            :y="a.y + (a.y - RADAR_CY) * 0.08"
            :text-anchor="a.x > RADAR_CX + 5 ? 'start' : a.x < RADAR_CX - 5 ? 'end' : 'middle'"
            class="trait-label"
          >
            {{ a.name }}
          </text>
        </svg>
        <div class="empty muted" v-else>
          特质数据不足，无法绘制雷达图。
        </div>
      </section>

      <!-- Right column: narrative + meta -->
      <section class="card narrative-card">
        <h2 class="card-title">自我叙事</h2>
        <p class="narrative-text">{{ profile.self_narrative }}</p>

        <div class="meta-row">
          <h3 class="meta-label">价值取向</h3>
          <div class="tag-row">
            <span v-for="v in profile.values" :key="v" class="tag tag-dmn">{{ v }}</span>
          </div>
        </div>

        <div class="meta-row">
          <h3 class="meta-label">兴趣</h3>
          <div class="tag-row">
            <span v-for="i in profile.interests" :key="i" class="tag">{{ i }}</span>
          </div>
        </div>

        <div class="meta-row">
          <h3 class="meta-label">内在冲突</h3>
          <p class="meta-text">{{ profile.internal_conflict }}</p>
        </div>
      </section>
    </div>

    <div class="identity-grid two-col">
      <section class="card">
        <h2 class="card-title">声音签名</h2>
        <dl class="kv-list">
          <div class="kv-row"><dt>句子节奏</dt><dd>{{ profile.voice_signature.sentence_rhythm }}</dd></div>
          <div class="kv-row"><dt>感官偏好</dt><dd>{{ profile.voice_signature.sensory_bias }}</dd></div>
          <div class="kv-row"><dt>情感基调</dt><dd>{{ profile.voice_signature.emotional_register }}</dd></div>
          <div class="kv-row">
            <dt>偏好意象</dt>
            <dd>
              <span v-for="img in profile.voice_signature.favorite_images" :key="img" class="tag tag-sn">{{ img }}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="card">
        <h2 class="card-title">当前创作</h2>
        <dl class="kv-list">
          <div class="kv-row"><dt>书名</dt><dd>{{ profile.current_novel.title }}</dd></div>
          <div class="kv-row"><dt>主题</dt><dd>{{ profile.current_novel.theme }}</dd></div>
          <div class="kv-row"><dt>主角</dt><dd>{{ profile.current_novel.protagonist }}</dd></div>
          <div class="kv-row"><dt>背景</dt><dd>{{ profile.current_novel.setting }}</dd></div>
        </dl>
      </section>
    </div>

    <div class="identity-grid two-col">
      <section class="card">
        <h2 class="card-title">日常习惯</h2>
        <dl class="kv-list">
          <div class="kv-row"><dt>早晨</dt><dd>{{ profile.habits.morning }}</dd></div>
          <div class="kv-row"><dt>白天</dt><dd>{{ profile.habits.daytime }}</dd></div>
          <div class="kv-row"><dt>傍晚</dt><dd>{{ profile.habits.evening }}</dd></div>
          <div class="kv-row"><dt>夜晚</dt><dd>{{ profile.habits.night }}</dd></div>
          <div class="kv-row">
            <dt>小癖好</dt>
            <dd>
              <span v-for="q in profile.habits.quirks" :key="q" class="tag">{{ q }}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="card">
        <h2 class="card-title">节律偏好</h2>
        <dl class="kv-list" v-if="rhythmLabel">
          <div class="kv-row"><dt>写作时段</dt><dd>{{ rhythmLabel.writing }}</dd></div>
          <div class="kv-row"><dt>睡眠</dt><dd>{{ rhythmLabel.sleep }}</dd></div>
          <div class="kv-row"><dt>用餐</dt><dd>{{ rhythmLabel.meals }}</dd></div>
          <div class="kv-row"><dt>能量峰值</dt><dd>{{ rhythmLabel.peak }}</dd></div>
        </dl>
        <div class="meta-row">
          <h3 class="meta-label">锚点</h3>
          <dl class="kv-list">
            <div class="kv-row"><dt>住所</dt><dd>{{ profile.anchors.home }}</dd></div>
            <div class="kv-row">
              <dt>物品</dt>
              <dd>
                <span v-for="o in profile.anchors.objects" :key="o" class="tag">{{ o }}</span>
              </dd>
            </div>
            <div class="kv-row">
              <dt>地点</dt>
              <dd>
                <span v-for="p in profile.anchors.places" :key="p" class="tag">{{ p }}</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>

    <section class="card" v-if="profile.childhood_memory">
      <h2 class="card-title">童年记忆</h2>
      <p class="meta-text italic">{{ profile.childhood_memory }}</p>
    </section>
  </div>

  <div class="loading-state" v-else>
    <div class="spinner" />
    <p class="muted">正在加载人格画像…</p>
    <p class="error-text" v-if="store.lastError">{{ store.lastError }}</p>
  </div>
</template>

<style scoped>
.identity-view {
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
  padding: 4px 0;
}

.view-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.view-subtitle {
  color: var(--text-muted);
  font-size: 13px;
  margin-top: 4px;
}

.integrity-card {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: var(--bg-2);
}

.integrity-card.tone-ok {
  border-color: var(--ok);
}
.integrity-card.tone-warn {
  border-color: var(--warn);
}
.integrity-card.tone-error {
  border-color: var(--error);
}

.integrity-value {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.identity-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
}

.identity-grid.two-col {
  grid-template-columns: 1fr 1fr;
}

.radar-card {
  display: flex;
  flex-direction: column;
}

.radar {
  width: 100%;
  height: auto;
  max-height: 280px;
}

.grid-ring {
  fill: none;
  stroke: var(--border);
  stroke-width: 1;
}

.grid-ring.outer {
  stroke: var(--border-soft);
}

.grid-axis {
  stroke: var(--border);
  stroke-width: 1;
}

.trait-poly {
  fill: var(--dmn-soft);
  stroke: var(--dmn);
  stroke-width: 1.5;
}

.trait-label {
  fill: var(--text-secondary);
  font-size: 10px;
  font-family: var(--font-sans);
  dominant-baseline: middle;
}

.empty {
  padding: 24px 0;
  text-align: center;
}

.narrative-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.narrative-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
}

.meta-row {
  margin-top: 8px;
}

.meta-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 6px 0;
}

.meta-text {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.6;
}

.meta-text.italic {
  font-style: italic;
  color: var(--text-secondary);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
}

.kv-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 12px;
  align-items: flex-start;
  font-size: 13px;
}

.kv-row dt {
  color: var(--text-muted);
  font-size: 12px;
}

.kv-row dd {
  margin: 0;
  color: var(--text-primary);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 0;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--border);
  border-top-color: var(--cen);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-text {
  color: var(--error);
  font-size: 12px;
}
</style>
