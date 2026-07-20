import { defineStore } from 'pinia'
import type {
  BusEvent,
  ConfigResponse,
  DmnReflectionsResponse,
  EosReportsResponse,
  IdentityResponse,
  IdentityHistoryResponse,
  MemoryFragmentsResponse,
  MemoryGraphResponse,
  MemoryTracesResponse,
  NetworksStateResponse,
  NpcDetailResponse,
  NpcHistoryResponse,
  NovelManuscriptResponse,
  SandboxStateResponse,
  ScheduleResponse,
  SnapshotResponse,
  SocialEncounter,
  SocialStateResponse,
} from '@/types'

// Central Pinia store for all WebUI data. Phase 1 uses simple REST fetches
// plus optional WebSocket patches. As the dashboard grows, each area
// (memory, sandbox, social, ...) can split into its own store module.
const API_BASE = ''

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

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return (await response.json()) as T
}

interface AgentState {
  identity: IdentityResponse | null
  identityHistory: IdentityHistoryResponse | null
  schedule: ScheduleResponse | null
  networks: NetworksStateResponse | null
  snapshot: SnapshotResponse | null
  // Phase 2 view-scoped data
  dmnReflections: DmnReflectionsResponse | null
  eosReports: EosReportsResponse | null
  memoryFragments: MemoryFragmentsResponse | null
  memoryTraces: MemoryTracesResponse | null
  memoryGraph: MemoryGraphResponse | null
  // Phase 3-5 view-scoped data
  socialState: SocialStateResponse | null
  npcDetail: NpcDetailResponse | null
  npcHistory: NpcHistoryResponse | null
  sandboxState: SandboxStateResponse | null
  novelManuscript: NovelManuscriptResponse | null
  busEvents: BusEvent[]
  config: ConfigResponse | null
  lastError: string | null
  loading: Record<string, boolean>
}

export const useAgentStore = defineStore('agent', {
  state: (): AgentState => ({
    identity: null,
    identityHistory: null,
    schedule: null,
    networks: null,
    snapshot: null,
    dmnReflections: null,
    eosReports: null,
    memoryFragments: null,
    memoryTraces: null,
    memoryGraph: null,
    socialState: null,
    npcDetail: null,
    npcHistory: null,
    sandboxState: null,
    novelManuscript: null,
    busEvents: [],
    config: null,
    lastError: null,
    loading: {},
  }),
  getters: {
    phase: (state): string => state.networks?.phase ?? '',
    hour: (state): number => state.networks?.hour ?? 0,
    energy: (state): number => state.networks?.energy ?? 0,
    alertCount: (state): number => state.networks?.alert_count ?? 0,
    mood: (state): Record<string, number> | null => state.networks?.mood ?? null,
    profile: (state) => state.identity?.profile ?? null,
    currentPhaseInfo: (state) => state.schedule?.schedule.current_phase_info ?? null,
  },
  actions: {
    setLoading(key: string, value: boolean) {
      this.loading[key] = value
    },
    async fetchIdentity() {
      this.setLoading('identity', true)
      try {
        this.identity = await fetchJson<IdentityResponse>('/api/identity')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('identity', false)
      }
    },
    async fetchIdentityHistory() {
      this.setLoading('identityHistory', true)
      try {
        this.identityHistory = await fetchJson<IdentityHistoryResponse>('/api/identity/history')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('identityHistory', false)
      }
    },
    async fetchSchedule() {
      this.setLoading('schedule', true)
      try {
        this.schedule = await fetchJson<ScheduleResponse>('/api/schedule/today')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('schedule', false)
      }
    },
    async fetchNetworks() {
      this.setLoading('networks', true)
      try {
        this.networks = await fetchJson<NetworksStateResponse>('/api/networks/state')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('networks', false)
      }
    },
    async fetchSnapshot() {
      this.setLoading('snapshot', true)
      try {
        this.snapshot = await fetchJson<SnapshotResponse>('/api/snapshot')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('snapshot', false)
      }
    },
    // Phase 2 view-scoped fetches.
    async fetchDmnReflections() {
      this.setLoading('dmnReflections', true)
      try {
        this.dmnReflections = await fetchJson<DmnReflectionsResponse>('/api/dmn/reflections?limit=20')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('dmnReflections', false)
      }
    },
    async fetchEosReports() {
      this.setLoading('eosReports', true)
      try {
        this.eosReports = await fetchJson<EosReportsResponse>('/api/eos/reports?limit=20')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('eosReports', false)
      }
    },
    async fetchMemoryFragments(source?: string, sort: string = 'recency', limit: number = 100) {
      this.setLoading('memoryFragments', true)
      try {
        const params = new URLSearchParams({ sort, limit: String(limit) })
        if (source) params.set('source', source)
        this.memoryFragments = await fetchJson<MemoryFragmentsResponse>(`/api/memory/fragments?${params}`)
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('memoryFragments', false)
      }
    },
    async fetchMemoryTraces(role?: string, sort: string = 'importance', limit: number = 100) {
      this.setLoading('memoryTraces', true)
      try {
        const params = new URLSearchParams({ sort, limit: String(limit) })
        if (role) params.set('role', role)
        this.memoryTraces = await fetchJson<MemoryTracesResponse>(`/api/memory/traces?${params}`)
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('memoryTraces', false)
      }
    },
    async fetchMemoryGraph() {
      this.setLoading('memoryGraph', true)
      try {
        this.memoryGraph = await fetchJson<MemoryGraphResponse>('/api/memory/graph')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('memoryGraph', false)
      }
    },
    // Phase 3-5 view-scoped fetches.
    async fetchSocialState() {
      this.setLoading('socialState', true)
      try {
        this.socialState = await fetchJson<SocialStateResponse>('/api/social/state')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('socialState', false)
      }
    },
    async fetchNpcDetail(npcId: string) {
      this.setLoading('npcDetail', true)
      try {
        this.npcDetail = await fetchJson<NpcDetailResponse>(`/api/social/npcs/${encodeURIComponent(npcId)}`)
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
        this.npcDetail = null
      } finally {
        this.setLoading('npcDetail', false)
      }
    },
    async fetchNpcHistory(npcId: string, limit: number = 50) {
      this.setLoading('npcHistory', true)
      try {
        this.npcHistory = await fetchJson<NpcHistoryResponse>(`/api/social/npcs/${encodeURIComponent(npcId)}/history?limit=${limit}`)
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
        this.npcHistory = null
      } finally {
        this.setLoading('npcHistory', false)
      }
    },
    async fetchEncounter(encounterId: string): Promise<SocialEncounter | null> {
      try {
        return await fetchJson<SocialEncounter>(`/api/social/encounters/${encodeURIComponent(encounterId)}`)
      } catch (e) {
        this.lastError = (e as Error).message
        return null
      }
    },
    clearNpcSelection() {
      this.npcDetail = null
      this.npcHistory = null
    },
    async fetchSandboxState() {
      this.setLoading('sandboxState', true)
      try {
        this.sandboxState = await fetchJson<SandboxStateResponse>('/api/sandbox/state')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('sandboxState', false)
      }
    },
    async fetchNovelManuscript() {
      this.setLoading('novelManuscript', true)
      try {
        this.novelManuscript = await fetchJson<NovelManuscriptResponse>('/api/novel/manuscript')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('novelManuscript', false)
      }
    },
    async fetchBusEvents(limit: number = 100) {
      this.setLoading('busEvents', true)
      try {
        const events = await fetchJson<BusEvent[]>(`/api/bus/events?limit=${limit}`)
        // Newest first; backend returns oldest-first from the deque.
        this.busEvents = Array.isArray(events) ? events.slice().reverse() : []
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('busEvents', false)
      }
    },
    async fetchConfig() {
      this.setLoading('config', true)
      try {
        this.config = await fetchJson<ConfigResponse>('/api/config')
        this.lastError = null
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.setLoading('config', false)
      }
    },
    async updateConfig(payload: Record<string, unknown>): Promise<boolean> {
      try {
        await postJson('/api/config', payload)
        // Re-fetch to surface normalized values.
        await this.fetchConfig()
        return true
      } catch (e) {
        this.lastError = (e as Error).message
        return false
      }
    },
    async emitControl(topic: string, payload: Record<string, unknown>): Promise<boolean> {
      try {
        await postJson(`/api/control/${topic}`, payload)
        return true
      } catch (e) {
        this.lastError = (e as Error).message
        return false
      }
    },
    // Patch topbar state from a WebSocket snapshot message. Keeps Phase 1
    // reactive without adding a second polling loop.
    applySnapshotPatch(snapshot: Partial<NetworksStateResponse>) {
      if (!snapshot) return
      if (this.networks === null) {
        this.networks = {
          phase: snapshot.phase ?? '',
          hour: snapshot.hour ?? 0,
          energy: snapshot.energy ?? 0,
          mood: snapshot.mood ?? null,
          alert_count: snapshot.alert_count ?? 0,
          networks: snapshot.networks ?? { sn: {}, dmn: {}, cen: {} },
          metabolism: snapshot.metabolism ?? {},
        }
      } else {
        if (typeof snapshot.phase === 'string') this.networks.phase = snapshot.phase
        if (typeof snapshot.hour === 'number') this.networks.hour = snapshot.hour
        if (typeof snapshot.energy === 'number') this.networks.energy = snapshot.energy
        if (snapshot.mood !== undefined) this.networks.mood = snapshot.mood
        if (typeof snapshot.alert_count === 'number') {
          this.networks.alert_count = snapshot.alert_count
        }
      }
    },
  },
})
