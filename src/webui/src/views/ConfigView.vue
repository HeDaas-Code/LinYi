<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useAgentStore } from '@/stores/agent'

// ConfigView (配置管理 + 控制面板) — Phase 5.
//
// Two responsibilities:
//   1. Inspect and edit the in-memory NovelistConfig. Edits POST to /api/config
//      (which only mutates the live object — no persistence).
//   2. Emit control messages onto the bus via /api/control/{topic}.
//
// Layout:
//   - Top: control panel (preset buttons + free-form topic/payload)
//   - Middle: section cards (one per NovelistConfig dataclass field),
//             each rendering its key/value pairs as inline-editable rows.
//   - Bottom: save bar showing dirty state.

const store = useAgentStore()

const config = computed(() => store.config)
const sections = computed<Array<[string, Record<string, unknown>]>>(() => {
  if (!config.value) return []
  return Object.entries(config.value)
    .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
    .filter(([k]) => !k.startsWith('_'))
    .slice(0, 24) as Array<[string, Record<string, unknown>]>
})

// Local editable copy. We sync from store.config on fetch.
const draft = reactive<Record<string, Record<string, unknown>>>({})
const lastLoadedAt = ref<number>(0)

function syncDraft() {
  if (!config.value) return
  for (const key of Object.keys(draft)) {
    delete draft[key]
  }
  for (const [section, values] of sections.value) {
    draft[section] = { ...(values as Record<string, unknown>) }
  }
  lastLoadedAt.value = Date.now()
}

watch(config, syncDraft, { deep: false })

function isDirty(section: string): boolean {
  const orig = config.value?.[section]
  if (!orig || typeof orig !== 'object') return false
  const cur = draft[section] ?? {}
  for (const k of Object.keys(orig as Record<string, unknown>)) {
    const a = (orig as Record<string, unknown>)[k]
    const b = cur[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) return true
  }
  for (const k of Object.keys(cur)) {
    if (!(k in (orig as Record<string, unknown>))) return true
  }
  return false
}

const anyDirty = computed(() => sections.value.some(([s]) => isDirty(s)))

function valueTone(v: unknown): string {
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'number') return 'num'
  if (typeof v === 'string') return 'str'
  return 'obj'
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function parseCell(input: string, originalType: string): unknown {
  if (originalType === 'num') {
    const n = parseFloat(input)
    return isNaN(n) ? input : n
  }
  if (originalType === 'bool') {
    return input === 'true' || input === '1'
  }
  if (originalType === 'obj') {
    try {
      return JSON.parse(input)
    } catch {
      return input
    }
  }
  return input
}

function inputType(v: unknown): string {
  if (typeof v === 'boolean') return 'checkbox'
  if (typeof v === 'number') return 'number'
  return 'text'
}

async function saveSection(section: string) {
  if (!isDirty(section)) return
  const ok = await store.updateConfig({ [section]: draft[section] })
  if (!ok) {
    alert(`保存 ${section} 失败：${store.lastError ?? 'unknown error'}`)
  }
}

async function saveAll() {
  const payload: Record<string, unknown> = {}
  for (const [s] of sections.value) {
    if (isDirty(s)) payload[s] = draft[s]
  }
  if (!Object.keys(payload).length) return
  const ok = await store.updateConfig(payload)
  if (!ok) {
    alert(`保存失败：${store.lastError ?? 'unknown error'}`)
  }
}

function resetSection(section: string) {
  const orig = config.value?.[section]
  if (!orig || typeof orig !== 'object') return
  draft[section] = { ...(orig as Record<string, unknown>) }
}

// ---------------------------------------------------------------------------
// Control panel
// ---------------------------------------------------------------------------

const controlTopic = ref<string>('sandbox.simulate')
const controlPayload = ref<string>('{}')
const controlLastResult = ref<string>('')

const presets: Array<{ label: string; topic: string; payload: string; tone: string }> = [
  { label: '沙盘·构建', topic: 'sandbox.build', payload: '{}', tone: 'cen' },
  { label: '沙盘·模拟一轮', topic: 'sandbox.simulate', payload: '{"rounds": 1}', tone: 'cen' },
  { label: '叙事·生成', topic: 'creation.executive.tick', payload: '{}', tone: 'warn' },
  { label: '代谢·小憩', topic: 'metabolism.rest', payload: '{"minutes": 30}', tone: 'dmn' },
  { label: '网络·强制 DMN', topic: 'network.switch', payload: '{"target": "dmn"}', tone: 'dmn' },
  { label: '网络·强制 CEN', topic: 'network.switch', payload: '{"target": "cen"}', tone: 'cen' },
]

function applyPreset(p: { topic: string; payload: string }) {
  controlTopic.value = p.topic
  controlPayload.value = p.payload
}

async function emitControl() {
  let payload: unknown = {}
  try {
    payload = controlPayload.value.trim() ? JSON.parse(controlPayload.value) : {}
  } catch (e) {
    controlLastResult.value = `payload 解析失败：${(e as Error).message}`
    return
  }
  const ok = await store.emitControl(controlTopic.value, payload as Record<string, unknown>)
  controlLastResult.value = ok
    ? `✓ 已发出 ${controlTopic.value} @ ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
    : `✗ 失败：${store.lastError ?? 'unknown'}`
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!store.config) {
    store.fetchConfig().then(syncDraft)
  } else {
    syncDraft()
  }
  // Config rarely changes; 60s polling is plenty.
  pollTimer = setInterval(() => store.fetchConfig(), 60000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="config-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">配置 & 控制</h1>
        <div class="view-subtitle">
          <span class="muted">配置段</span>
          <span class="mono">{{ sections.length }}</span>
          <span class="sep">·</span>
          <span class="muted">加载于</span>
          <span class="mono">{{ lastLoadedAt ? new Date(lastLoadedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—' }}</span>
          <span class="sep">·</span>
          <span :class="['status', anyDirty ? 'status-dirty' : 'status-clean']">
            {{ anyDirty ? '有未保存修改' : '已同步' }}
          </span>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn-refresh" @click="store.fetchConfig()">重新加载</button>
        <button :class="['btn-save-all', { dirty: anyDirty }]" :disabled="!anyDirty" @click="saveAll">
          保存全部
        </button>
      </div>
    </header>

    <!-- Control panel -->
    <section class="card control-card">
      <h2 class="card-title">控制面板 · 总线指令</h2>
      <div class="preset-row">
        <button
          v-for="p in presets"
          :key="p.label"
          :class="['preset-btn', `tone-${p.tone}`]"
          @click="applyPreset(p)"
        >
          {{ p.label }}
        </button>
      </div>
      <div class="control-form">
        <div class="control-group">
          <label class="control-label">topic</label>
          <input v-model="controlTopic" type="text" class="control-input mono" placeholder="e.g. sandbox.simulate" />
        </div>
        <div class="control-group">
          <label class="control-label">payload (JSON)</label>
          <textarea v-model="controlPayload" rows="2" class="control-textarea mono" placeholder="{}" />
        </div>
        <div class="control-actions">
          <button class="btn-emit" @click="emitControl">发出</button>
          <span class="control-result" :class="{ ok: controlLastResult.startsWith('✓'), err: controlLastResult.startsWith('✗') }">
            {{ controlLastResult || '—' }}
          </span>
        </div>
      </div>
    </section>

    <!-- Config sections -->
    <section v-for="[section, values] in sections" :key="section" class="card section-card">
      <div class="section-head">
        <h2 class="section-name mono">{{ section }}</h2>
        <div class="section-actions">
          <span :class="['dirty-pill', { on: isDirty(section) }]">
            {{ isDirty(section) ? '未保存' : '已同步' }}
          </span>
          <button class="btn-mini" @click="resetSection(section)" :disabled="!isDirty(section)">还原</button>
          <button class="btn-mini primary" @click="saveSection(section)" :disabled="!isDirty(section)">保存</button>
        </div>
      </div>
      <div class="section-body">
        <div v-for="(val, key) in values" :key="String(key)" class="kv-row">
          <label class="kv-key mono">{{ key }}</label>
          <input
            v-if="inputType(val) === 'checkbox'"
            type="checkbox"
            class="kv-checkbox"
            :checked="draft[section]?.[key as string] === true"
            @change="(e) => { draft[section] = draft[section] ?? {}; draft[section][key as string] = (e.target as HTMLInputElement).checked }"
          />
          <input
            v-else
            :type="inputType(val)"
            class="kv-input mono"
            :class="`val-${valueTone(val)}`"
            :value="formatCell(draft[section]?.[key as string] ?? val)"
            @input="(e) => { draft[section] = draft[section] ?? {}; draft[section][key as string] = parseCell((e.target as HTMLInputElement).value, valueTone(val)) }"
          />
          <span :class="['kv-type', `type-${valueTone(val)}`]">{{ valueTone(val) }}</span>
        </div>
        <div v-if="!Object.keys(values).length" class="empty-section">（此段无字段）</div>
      </div>
    </section>

    <section class="card empty-card" v-if="!sections.length">
      <div class="empty-icon">∅</div>
      <p class="empty-text">未加载到配置对象。请确认 agent 已启动并注册 NovelistConfig。</p>
    </section>
  </div>
</template>

<style scoped>
.config-view {
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
  align-items: center;
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

.sep {
  color: var(--text-muted);
  margin: 0 4px;
}

.status {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.status-clean {
  background: rgba(74, 222, 128, 0.16);
  color: var(--ok);
}

.status-dirty {
  background: var(--sn-soft);
  color: var(--sn);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn-refresh,
.btn-save-all {
  padding: 6px 14px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-2);
  color: var(--text-secondary);
  transition: all 0.15s var(--ease-out);
}

.btn-refresh:hover {
  background: var(--bg-3);
  color: var(--text-primary);
}

.btn-save-all {
  background: var(--cen-soft);
  border-color: var(--cen);
  color: var(--cen);
}

.btn-save-all.dirty:not(:disabled) {
  background: var(--cen);
  color: var(--bg-0);
}

.btn-save-all:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Control panel */
.control-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset-btn {
  padding: 5px 12px;
  font-size: 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s var(--ease-out);
}

.preset-btn:hover {
  background: var(--bg-3);
}

.preset-btn.tone-cen {
  border-color: var(--cen);
  color: var(--cen);
}

.preset-btn.tone-dmn {
  border-color: var(--dmn);
  color: var(--dmn);
}

.preset-btn.tone-warn {
  border-color: var(--warn);
  color: var(--warn);
}

.control-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.control-input,
.control-textarea {
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  font-family: var(--font-mono);
}

.control-input:focus,
.control-textarea:focus {
  border-color: var(--cen);
}

.control-textarea {
  resize: vertical;
  font-size: 12px;
}

.control-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-emit {
  padding: 6px 16px;
  font-size: 12px;
  background: var(--sn);
  color: var(--bg-0);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.15s var(--ease-out);
}

.btn-emit:hover {
  opacity: 0.85;
}

.control-result {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.control-result.ok {
  color: var(--ok);
}

.control-result.err {
  color: var(--error);
}

/* Config sections */
.section-card {
  padding: 14px 16px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-soft);
}

.section-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dirty-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  background: var(--bg-3);
  color: var(--text-muted);
}

.dirty-pill.on {
  background: var(--sn-soft);
  color: var(--sn);
}

.btn-mini {
  padding: 3px 10px;
  font-size: 11px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
}

.btn-mini:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-mini.primary {
  background: var(--cen-soft);
  border-color: var(--cen);
  color: var(--cen);
}

.btn-mini.primary:not(:disabled):hover {
  background: var(--cen);
  color: var(--bg-0);
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kv-row {
  display: grid;
  grid-template-columns: 200px 1fr 50px;
  gap: 10px;
  align-items: center;
}

.kv-key {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kv-input {
  background: var(--bg-0);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 4px 8px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  font-family: var(--font-mono);
  min-width: 0;
}

.kv-input:focus {
  border-color: var(--cen);
}

.kv-input.val-bool {
  background: var(--bg-3);
}

.kv-checkbox {
  justify-self: start;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.kv-type {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-muted);
  font-family: var(--font-mono);
  text-align: right;
}

.type-bool { color: var(--sn); }
.type-num { color: var(--cen); }
.type-str { color: var(--text-secondary); }
.type-obj { color: var(--dmn); }

.empty-section {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
  padding: 8px 0;
}

.empty-card {
  text-align: center;
  padding: 40px 16px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.empty-text {
  margin: 0;
  font-size: 13px;
}
</style>
