import { onBeforeUnmount, onMounted } from 'vue'
import { useAgentStore } from '@/stores/agent'

// useAgentSnapshot: lightweight polling + optional WebSocket patch loop.
//
// Phase 1 strategy (from docs/WEBUI-REFACTOR.md §3.5):
//   - Poll /api/networks/state every 5s for the topbar.
//   - Poll /api/schedule/today every 30s (phase changes are slow).
//   - Poll /api/identity every 60s (traits barely move).
//   - If a WebSocket is reachable, apply snapshot patches to networks state.
//
// The composable is intentionally minimal: it owns the timers and exposes
// start/stop so components can wire it to their lifecycle. As Phase 2 adds
// per-view polling (memory, sandbox, ...), each view can launch its own
// composable instance rather than growing this one.

const NETWORKS_POLL_MS = 5000
const SCHEDULE_POLL_MS = 30000
const IDENTITY_POLL_MS = 60000

// WS reconnect backoff
const WS_BASE_DELAY_MS = 1000
const WS_MAX_DELAY_MS = 30000

export function useAgentSnapshot() {
  const store = useAgentStore()

  let networksTimer: ReturnType<typeof setInterval> | null = null
  let scheduleTimer: ReturnType<typeof setInterval> | null = null
  let identityTimer: ReturnType<typeof setInterval> | null = null
  let ws: WebSocket | null = null
  let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
  let wsAttempt = 0
  let stopped = false

  function pollNetworks() {
    store.fetchNetworks().catch(() => {
      /* error already recorded in store.lastError */
    })
  }

  function pollSchedule() {
    store.fetchSchedule().catch(() => {})
  }

  function pollIdentity() {
    store.fetchIdentity().catch(() => {})
  }

  function buildWsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws`
  }

  function connectWs() {
    if (stopped) return
    if (typeof WebSocket === 'undefined') return

    try {
      ws = new WebSocket(buildWsUrl())
    } catch {
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      wsAttempt = 0
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg && typeof msg === 'object') {
          // Snapshot messages from the FastAPI broadcast loop carry the same
          // shape as /api/networks/state for the topbar-relevant fields.
          store.applySnapshotPatch(msg)
        }
      } catch {
        /* ignore non-JSON frames */
      }
    }

    ws.onerror = () => {
      // onclose will fire next; schedule a reconnect there.
    }

    ws.onclose = () => {
      ws = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (stopped) return
    if (wsReconnectTimer) return
    wsAttempt += 1
    const delay = Math.min(WS_MAX_DELAY_MS, WS_BASE_DELAY_MS * 2 ** (wsAttempt - 1))
    wsReconnectTimer = setTimeout(() => {
      wsReconnectTimer = null
      connectWs()
    }, delay)
  }

  function start() {
    stopped = false
    if (networksTimer === null) {
      networksTimer = setInterval(pollNetworks, NETWORKS_POLL_MS)
    }
    if (scheduleTimer === null) {
      scheduleTimer = setInterval(pollSchedule, SCHEDULE_POLL_MS)
    }
    if (identityTimer === null) {
      identityTimer = setInterval(pollIdentity, IDENTITY_POLL_MS)
    }
    if (ws === null && wsReconnectTimer === null) {
      connectWs()
    }
  }

  function stop() {
    stopped = true
    if (networksTimer) {
      clearInterval(networksTimer)
      networksTimer = null
    }
    if (scheduleTimer) {
      clearInterval(scheduleTimer)
      scheduleTimer = null
    }
    if (identityTimer) {
      clearInterval(identityTimer)
      identityTimer = null
    }
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer)
      wsReconnectTimer = null
    }
    if (ws) {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      ws = null
    }
  }

  onMounted(() => {
    // start() is invoked explicitly by App.vue so the first render can
    // finish before timers begin. This hook is a safety net for components
    // that use the composable standalone.
  })

  onBeforeUnmount(() => {
    stop()
  })

  return { start, stop }
}
