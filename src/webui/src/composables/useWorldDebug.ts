import { onBeforeUnmount, ref } from 'vue'
import type {
  NarrativeReplayResponse,
  WorldDiffResponse,
  WorldSnapshotResponse,
} from '@/types'

// useWorldDebug — Stage 5 Task 5.2 composable.
//
// 封装 WorldVisualDebugger（src/novelist_brain/world_visual_debugger.py）
// 通过 web/app.py（Task 5.3）暴露的 3 个调试 HTTP 接口：
//
//   GET /debug/world/snapshot                  → WorldSnapshotResponse
//   GET /debug/world/diff?from_version=&to_version=...
//                                              → WorldDiffResponse
//   GET /debug/narrative/replay                → NarrativeReplayResponse
//
// 设计要点（参考 useAgentSnapshot.ts 的轮询 + 错误处理风格）：
//   - 每个接口独立的 loading / error / data ref，便于组件按需绑定
//   - 不写入全局 Pinia store（调试数据属于视图私有，避免污染主状态）
//   - fetchSnapshot 支持轻量轮询；diff / replay 按需手动触发
//   - 接口不可用时把错误写入 error ref，组件可用 v-if 显示提示
//   - 不抛出异常到调用方；调用方只需读取 .error 即可

const API_BASE = ''

// 默认 30s 轮询一次快照（世界状态变化较慢，与 SandboxView 的 20s 同量级）。
const SNAPSHOT_POLL_MS = 30000

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return (await response.json()) as T
}

export function useWorldDebug() {
  // --- snapshot -------------------------------------------------------------
  const snapshot = ref<WorldSnapshotResponse | null>(null)
  const snapshotLoading = ref(false)
  const snapshotError = ref<string | null>(null)
  const snapshotHistory = ref<WorldSnapshotResponse[]>([])
  let snapshotTimer: ReturnType<typeof setInterval> | null = null

  async function fetchSnapshot(): Promise<void> {
    snapshotLoading.value = true
    snapshotError.value = null
    try {
      const data = await fetchJson<WorldSnapshotResponse>('/debug/world/snapshot')
      snapshot.value = data
      // 维护一个最近 10 条快照的轻量历史，供 WorldDiff 版本选择器使用
      // （后端也会持久化最近 10 条到 debug_state/{novel_id}.json，但前端
      // 自己缓存一份可避免在版本选择器里多打一次接口）。
      const hist = snapshotHistory.value.filter(
        (s) => s.snapshot_id !== data.snapshot_id,
      )
      hist.push(data)
      if (hist.length > 10) hist.splice(0, hist.length - 10)
      snapshotHistory.value = hist
    } catch (e) {
      snapshotError.value = (e as Error).message
    } finally {
      snapshotLoading.value = false
    }
  }

  function startSnapshotPolling(intervalMs: number = SNAPSHOT_POLL_MS): void {
    if (snapshotTimer !== null) return
    snapshotTimer = setInterval(() => {
      void fetchSnapshot()
    }, intervalMs)
  }

  function stopSnapshotPolling(): void {
    if (snapshotTimer !== null) {
      clearInterval(snapshotTimer)
      snapshotTimer = null
    }
  }

  // --- diff -----------------------------------------------------------------
  const diff = ref<WorldDiffResponse | null>(null)
  const diffLoading = ref(false)
  const diffError = ref<string | null>(null)

  async function fetchDiff(
    fromVersion?: string,
    toVersion?: string,
  ): Promise<void> {
    diffLoading.value = true
    diffError.value = null
    try {
      const params = new URLSearchParams()
      if (fromVersion) params.set('from_version', fromVersion)
      if (toVersion) params.set('to_version', toVersion)
      const qs = params.toString()
      const path = qs ? `/debug/world/diff?${qs}` : '/debug/world/diff'
      diff.value = await fetchJson<WorldDiffResponse>(path)
    } catch (e) {
      diffError.value = (e as Error).message
      diff.value = null
    } finally {
      diffLoading.value = false
    }
  }

  // --- replay ---------------------------------------------------------------
  const replay = ref<NarrativeReplayResponse | null>(null)
  const replayLoading = ref(false)
  const replayError = ref<string | null>(null)

  async function fetchReplay(): Promise<void> {
    replayLoading.value = true
    replayError.value = null
    try {
      replay.value = await fetchJson<NarrativeReplayResponse>('/debug/narrative/replay')
    } catch (e) {
      replayError.value = (e as Error).message
      replay.value = null
    } finally {
      replayLoading.value = false
    }
  }

  // 组件卸载时统一清理定时器，避免内存泄漏与跨组件污染。
  onBeforeUnmount(() => {
    stopSnapshotPolling()
  })

  return {
    // snapshot
    snapshot,
    snapshotLoading,
    snapshotError,
    snapshotHistory,
    fetchSnapshot,
    startSnapshotPolling,
    stopSnapshotPolling,
    // diff
    diff,
    diffLoading,
    diffError,
    fetchDiff,
    // replay
    replay,
    replayLoading,
    replayError,
    fetchReplay,
  }
}
