<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type {
  NarrativeReplayResponse,
  NarrativeReplayRound,
  NarrativeReplaySkillCheck,
} from '@/types'

// NarrativeReplay — Stage 5 Task 5.2 SubTask 5.2.4
//
// 推演回放组件：回放最近一轮 COC 推演。
//   - 显示每轮的 skill checks（骰子结果、难度、成功率）
//   - 显示 narrative impact（叙事影响）
//   - 显示最终 narrative
//   - 播放 / 暂停 / 步进控制
//
// 调用 GET /debug/narrative/replay
// 数据来自后端 WorldVisualDebugger._emit_replay 发布的
// data.debug.narrative.replay topic（由 web/app.py Task 5.3 透出为 HTTP）。

const props = defineProps<{
  replay: NarrativeReplayResponse | null
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

// 当前播放到的 round 索引（从 0 开始）；-1 表示尚未开始，rounds.length 表示已结束。
const currentRoundIdx = ref(0)
const isPlaying = ref(false)
const playIntervalMs = 1500
let playTimer: ReturnType<typeof setInterval> | null = null

const rounds = computed<NarrativeReplayRound[]>(() => props.replay?.rounds ?? [])
const totalRounds = computed(() => rounds.value.length)

const currentRound = computed<NarrativeReplayRound | null>(() => {
  if (!rounds.value.length) return null
  const idx = Math.min(currentRoundIdx.value, rounds.value.length - 1)
  return rounds.value[idx] ?? null
})

const atStart = computed(() => currentRoundIdx.value <= 0)
const atEnd = computed(() => currentRoundIdx.value >= totalRounds.value - 1)

// 当一个新的 replay 进来时，重置播放位置。
watch(
  () => props.replay?.replay_id,
  () => {
    currentRoundIdx.value = rounds.value.length ? 0 : 0
    pause()
  },
)

function stepForward(): void {
  if (atEnd.value) {
    pause()
    return
  }
  currentRoundIdx.value = Math.min(currentRoundIdx.value + 1, totalRounds.value - 1)
}

function stepBack(): void {
  currentRoundIdx.value = Math.max(currentRoundIdx.value - 1, 0)
}

function jumpTo(idx: number): void {
  currentRoundIdx.value = Math.max(0, Math.min(idx, totalRounds.value - 1))
}

function play(): void {
  if (!rounds.value.length) return
  if (playTimer) return
  if (atEnd.value) currentRoundIdx.value = 0
  isPlaying.value = true
  playTimer = setInterval(() => {
    if (atEnd.value) {
      pause()
      return
    }
    stepForward()
  }, playIntervalMs)
}

function pause(): void {
  isPlaying.value = false
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = null
  }
}

onBeforeUnmount(() => {
  pause()
})

function fmtPct(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  if (!isFinite(n)) return '—'
  return `${(n * 100).toFixed(0)}%`
}

function checkTone(c: NarrativeReplaySkillCheck): string {
  if (typeof c.success === 'boolean') return c.success ? 'ok' : 'error'
  // 没有显式 success 字段时按 roll vs difficulty 推断
  if (typeof c.roll === 'number' && typeof c.difficulty === 'number') {
    return c.roll <= c.difficulty ? 'ok' : 'error'
  }
  return 'neutral'
}

function checkLabel(c: NarrativeReplaySkillCheck): string {
  if (typeof c.success === 'boolean') return c.success ? '成功' : '失败'
  return '—'
}

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return '—'
  const t = Date.parse(ts)
  if (Number.isNaN(t)) return ts
  return new Date(t).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}
</script>

<template>
  <div class="narrative-replay">
    <div class="replay-toolbar">
      <div class="replay-meta" v-if="replay">
        <span class="meta-row"><span class="muted">推演轮次</span> <span class="mono">{{ replay.simulation_round }}</span></span>
        <span class="meta-row" v-if="replay.chapter_index != null"><span class="muted">章节</span> <span class="mono">{{ replay.chapter_index }}</span></span>
        <span class="meta-row" v-if="replay.scenario_id"><span class="muted">场景</span> <span class="mono">{{ replay.scenario_id }}</span></span>
        <span class="meta-row muted">{{ fmtTime(replay.timestamp) }}</span>
      </div>
      <div class="replay-controls">
        <button class="ctrl-btn" @click="stepBack" :disabled="atStart || !totalRounds">◀ 上一步</button>
        <button v-if="!isPlaying" class="ctrl-btn primary" @click="play" :disabled="!totalRounds">▶ 播放</button>
        <button v-else class="ctrl-btn primary" @click="pause">⏸ 暂停</button>
        <button class="ctrl-btn" @click="stepForward" :disabled="atEnd || !totalRounds">下一步 ▶</button>
        <button class="ctrl-btn" @click="emit('refresh')">↻ 刷新</button>
      </div>
    </div>

    <div v-if="loading" class="empty muted">回放加载中…</div>
    <div v-else-if="error" class="empty error">
      接口不可用：{{ error }}
      <p class="hint muted">请确认后端 web/app.py 已实现 <code>GET /debug/narrative/replay</code>。</p>
    </div>
    <div v-else-if="!replay" class="empty muted">暂无推演回放数据</div>
    <div v-else-if="!totalRounds" class="empty muted">本轮推演没有可回放的 round</div>

    <div v-else class="replay-body">
      <!-- 进度条 -->
      <div class="rounds-progress">
        <button
          v-for="(r, i) in rounds"
          :key="i"
          :class="['round-tick', { active: i === currentRoundIdx, done: i < currentRoundIdx }]"
          @click="jumpTo(i)"
          :title="`第 ${r.round} 轮`"
        >
          <span class="tick-num">{{ r.round }}</span>
        </button>
      </div>

      <!-- 当前轮详情 -->
      <section class="round-card" v-if="currentRound">
        <header class="round-head">
          <h3 class="round-title">第 {{ currentRound.round }} 轮 / 共 {{ totalRounds }} 轮</h3>
          <span class="muted">{{ currentRound.skill_checks.length }} 个检定</span>
        </header>

        <div class="round-content">
          <h4 class="block-title">技能检定（COC）</h4>
          <div v-if="!currentRound.skill_checks.length" class="empty muted small">本轮无检定记录</div>
          <ul v-else class="check-list">
            <li
              v-for="(c, i) in currentRound.skill_checks"
              :key="i"
              :class="['check-row', `tone-${checkTone(c)}`]"
            >
              <span class="check-result tag" :class="`tone-${checkTone(c)}`">{{ checkLabel(c) }}</span>
              <span class="check-char">{{ c.character_name || c.character_id || '—' }}</span>
              <span class="check-skill muted">{{ c.skill || '—' }}</span>
              <span class="check-roll mono">骰 {{ c.roll ?? c.dice ?? '—' }}</span>
              <span class="check-diff mono">难度 {{ c.difficulty ?? '—' }}</span>
              <span class="check-rate mono">成功率 {{ fmtPct(c.success_rate) }}</span>
              <span class="check-outcome muted" v-if="c.outcome">{{ c.outcome }}</span>
            </li>
          </ul>

          <h4 class="block-title">叙事影响</h4>
          <div class="narrative-impact">
            <template v-if="currentRound.narrative_impact">{{ currentRound.narrative_impact }}</template>
            <span v-else class="muted">本轮无叙事影响记录</span>
          </div>
        </div>
      </section>

      <!-- 最终叙事 -->
      <section class="final-card" v-if="replay.final_narrative">
        <h3 class="block-title">最终叙事</h3>
        <div class="final-narrative">{{ replay.final_narrative }}</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.narrative-replay {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.replay-toolbar {
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

.replay-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-primary);
}

.meta-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.replay-controls {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ctrl-btn {
  padding: 4px 12px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s var(--ease-out);
}
.ctrl-btn:hover:not(:disabled) { background: var(--bg-3); }
.ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ctrl-btn.primary { border-color: var(--cen); color: var(--cen); }
.ctrl-btn.primary:hover:not(:disabled) { background: var(--cen-soft); }

.replay-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rounds-progress {
  display: flex;
  gap: 4px;
  padding: 8px 10px;
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  flex-wrap: wrap;
}

.round-tick {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-3);
  border: 1px solid var(--border-soft);
  color: var(--text-muted);
  font-size: 11px;
  font-family: var(--font-mono);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s var(--ease-out);
}
.round-tick:hover { background: var(--bg-2); border-color: var(--cen); }
.round-tick.done { background: var(--dmn-soft); color: var(--dmn); border-color: var(--dmn); }
.round-tick.active {
  background: var(--cen-soft);
  color: var(--cen);
  border-color: var(--cen);
  box-shadow: 0 0 0 2px rgba(98, 175, 233, 0.2);
}

.tick-num { font-weight: 600; }

.round-card {
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 12px 14px;
}

.round-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.round-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.block-title {
  margin: 12px 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.block-title:first-child { margin-top: 0; }

.check-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.check-row {
  display: grid;
  grid-template-columns: 60px 1.2fr 1fr 70px 80px 80px 1fr;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  background: var(--bg-2);
  border-radius: 4px;
  border-left: 3px solid var(--border);
  font-size: 11px;
}
.check-row.tone-ok { border-left-color: var(--ok); }
.check-row.tone-error { border-left-color: var(--error); }
.check-row.tone-neutral { border-left-color: var(--text-muted); }

.check-result {
  font-size: 10px;
  padding: 1px 8px;
  border-radius: 10px;
  text-align: center;
  border: 1px solid var(--border-soft);
  background: var(--bg-3);
  color: var(--text-secondary);
}
.check-result.tone-ok { background: rgba(74, 222, 128, 0.16); color: var(--ok); }
.check-result.tone-error { background: rgba(248, 113, 113, 0.16); color: var(--error); }

.check-char {
  color: var(--text-primary);
  font-weight: 500;
}

.check-skill {
  font-size: 11px;
}

.mono { font-family: var(--font-mono); color: var(--text-secondary); }

.check-outcome {
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.narrative-impact {
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-left: 3px solid var(--dmn);
  border-radius: 4px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.final-card {
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  border-left: 3px solid #d4af37;
  border-radius: 8px;
  padding: 12px 14px;
}

.final-narrative {
  background: var(--bg-2);
  border-radius: 4px;
  padding: 12px 14px;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
}

.muted { color: var(--text-muted); }
.error { color: var(--error); }

.empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}
.empty.small { padding: 8px; font-size: 11px; }
.empty.error { color: var(--error); }
.empty .hint { font-size: 11px; margin-top: 6px; }
.empty code {
  font-family: var(--font-mono);
  background: var(--bg-3);
  padding: 1px 4px;
  border-radius: 3px;
}

@media (max-width: 900px) {
  .check-row {
    grid-template-columns: 60px 1fr 70px;
    grid-template-rows: auto auto auto;
    gap: 4px 8px;
  }
  .check-skill, .check-diff, .check-rate, .check-outcome {
    grid-column: 2 / -1;
  }
}
</style>
