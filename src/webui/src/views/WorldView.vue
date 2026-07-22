<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import WorldGraph from '@/components/social/WorldGraph.vue'
import WorldTimeline from '@/components/social/WorldTimeline.vue'
import WorldDiff from '@/components/social/WorldDiff.vue'
import NarrativeReplay from '@/components/social/NarrativeReplay.vue'
import { useWorldDebug } from '@/composables/useWorldDebug'

// WorldView — Stage 5 Task 5.2 容器视图。
//
// 选择「选项 B」：新建独立 view 而非塞进 SocialView，避免 SocialView
// （已含 PixiCanvas tilemap 渲染 + NPC 详情面板 + 遭遇时间线）继续膨胀。
//
// 4 个 tab 对应 4 个子任务：
//   - 图谱   → WorldGraph     (5.2.1)
//   - 时间线 → WorldTimeline  (5.2.2)
//   - 对比   → WorldDiff      (5.2.3)
//   - 回放   → NarrativeReplay(5.2.4)
//
// 数据：通过 useWorldDebug composable 调用 3 个 /debug/* 接口；快照默认
// 每 30s 轮询一次（与 SandboxView 同量级），diff / replay 在切换到对应
// tab 时按需触发。

type TabKey = 'graph' | 'timeline' | 'diff' | 'replay'

interface TabDef {
  key: TabKey
  label: string
  hint: string
}

const TABS: TabDef[] = [
  { key: 'graph', label: '世界图谱', hint: '地点 / 势力 / 角色关系' },
  { key: 'timeline', label: '时间线', hint: '历史事件 / 伏笔 / 规则' },
  { key: 'diff', label: '版本对比', hint: '两版世界差异' },
  { key: 'replay', label: '推演回放', hint: 'COC 推演过程' },
]

const activeTab = ref<TabKey>('graph')

const {
  snapshot,
  snapshotLoading,
  snapshotError,
  snapshotHistory,
  fetchSnapshot,
  startSnapshotPolling,
  diff,
  diffLoading,
  diffError,
  fetchDiff,
  replay,
  replayLoading,
  replayError,
  fetchReplay,
} = useWorldDebug()

// 版本选择器的当前值。默认空，由 onMounted 在拉到第一批 snapshotHistory
// 后填入“次新 → 最新”两个版本（与后端 _handle_diff_request 默认行为一致）。
const fromVersion = ref('')
const toVersion = ref('')

const snapshotVersion = computed(() => snapshot.value?.version ?? '—')

function onFetchDiff(): void {
  void fetchDiff(fromVersion.value, toVersion.value)
}

// 切换 tab 时按需触发数据加载（避免初次进入就打 3 个接口）。
watch(activeTab, (t) => {
  if (t === 'diff' && !diff.value && !diffLoading.value) {
    // 若未指定 from/to，则用 snapshotHistory 的次新 + 最新。
    if (!fromVersion.value || !toVersion.value) {
      const hist = snapshotHistory.value
      if (hist.length >= 2) {
        fromVersion.value = hist[hist.length - 2].version
        toVersion.value = hist[hist.length - 1].version
      } else if (hist.length === 1) {
        toVersion.value = hist[0].version
      }
    }
    if (fromVersion.value && toVersion.value && fromVersion.value !== toVersion.value) {
      onFetchDiff()
    } else {
      // 没有足够历史时也调一次（后端默认会比较 newest vs second-newest）
      void fetchDiff()
    }
  }
  if (t === 'replay' && !replay.value && !replayLoading.value) {
    void fetchReplay()
  }
})

onMounted(async () => {
  await fetchSnapshot()
  // 首次拉到 snapshot 后启动轮询。
  startSnapshotPolling()
})

// 切换到 diff tab 时如果用户没有指定版本，确保有默认值。
watch(snapshotHistory, (hist) => {
  if (activeTab.value !== 'diff') return
  if (!fromVersion.value && hist.length >= 2) {
    fromVersion.value = hist[hist.length - 2].version
  }
  if (!toVersion.value && hist.length >= 1) {
    toVersion.value = hist[hist.length - 1].version
  }
})

// 暴露给模板的 tab 切换处理。
function selectTab(t: TabKey): void {
  activeTab.value = t
}
</script>

<template>
  <div class="world-view">
    <header class="view-header">
      <div>
        <h1 class="view-title">世界图谱</h1>
        <div class="view-subtitle">
          Stage 5 调试视图 · 当前快照版本 <span class="mono">{{ snapshotVersion }}</span>
          <span class="muted" v-if="snapshot"> · {{ snapshot.geography.length }} 地点 / {{ snapshot.factions.length }} 势力 / {{ snapshot.characters.length }} 角色 / {{ snapshot.rules.length }} 规则</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="link-btn" @click="fetchSnapshot" :disabled="snapshotLoading">
          {{ snapshotLoading ? '刷新中…' : '↻ 刷新快照' }}
        </button>
      </div>
    </header>

    <nav class="tab-bar">
      <button
        v-for="t in TABS"
        :key="t.key"
        :class="['tab', { active: activeTab === t.key }]"
        @click="selectTab(t.key)"
      >
        <span class="tab-label">{{ t.label }}</span>
        <span class="tab-hint muted">{{ t.hint }}</span>
      </button>
    </nav>

    <section class="tab-content" v-show="activeTab === 'graph'">
      <WorldGraph
        :snapshot="snapshot"
        :loading="snapshotLoading"
        :error="snapshotError"
      />
    </section>

    <section class="tab-content" v-show="activeTab === 'timeline'">
      <WorldTimeline
        :snapshot="snapshot"
        :loading="snapshotLoading"
        :error="snapshotError"
      />
    </section>

    <section class="tab-content" v-show="activeTab === 'diff'">
      <WorldDiff
        :diff="diff"
        :loading="diffLoading"
        :error="diffError"
        :snapshot-history="snapshotHistory"
        v-model:from-version="fromVersion"
        v-model:to-version="toVersion"
        @fetch-diff="onFetchDiff"
      />
    </section>

    <section class="tab-content" v-show="activeTab === 'replay'">
      <NarrativeReplay
        :replay="replay"
        :loading="replayLoading"
        :error="replayError"
        @refresh="fetchReplay"
      />
    </section>

    <div class="card empty-card" v-if="snapshotError && !snapshot">
      <div class="empty-state">
        <div class="empty-icon">🌐</div>
        <p>世界快照接口不可用</p>
        <p class="muted">{{ snapshotError }}</p>
        <p class="hint muted">
          请确认后端 <code>web/app.py</code> 已实现 <code>GET /debug/world/snapshot</code>
          （Task 5.3）。在接口可用前，本视图其余 tab 也将无数据。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.world-view {
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

.mono { font-family: var(--font-mono); color: var(--text-secondary); }
.muted { color: var(--text-muted); }

.header-actions {
  display: flex;
  gap: 8px;
}

.link-btn {
  background: transparent;
  border: 1px solid var(--cen);
  color: var(--cen);
  padding: 6px 14px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}
.link-btn:hover:not(:disabled) { background: var(--cen-soft); }
.link-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.tab-bar {
  display: flex;
  gap: 4px;
  background: var(--bg-2);
  padding: 6px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  flex-wrap: wrap;
}

.tab {
  flex: 1;
  min-width: 140px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--text-secondary);
  transition: background 0.15s var(--ease-out), color 0.15s var(--ease-out);
}
.tab:hover { background: var(--bg-3); color: var(--text-primary); }
.tab.active {
  background: var(--bg-3);
  color: var(--text-primary);
  border-color: var(--cen);
}

.tab-label { font-size: 13px; font-weight: 600; }
.tab-hint { font-size: 10px; }

.tab-content {
  display: block;
}

.empty-card {
  padding: 40px 20px;
}
.empty-state {
  text-align: center;
}
.empty-icon { font-size: 36px; margin-bottom: 8px; }
.empty-state .hint {
  font-size: 11px;
  margin-top: 12px;
  line-height: 1.6;
}
.empty-state code {
  font-family: var(--font-mono);
  background: var(--bg-3);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

@media (max-width: 760px) {
  .tab {
    min-width: 100px;
  }
  .tab-hint { display: none; }
}
</style>
