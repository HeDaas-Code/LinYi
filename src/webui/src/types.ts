// Shared TypeScript types for the LinYi WebUI.
// These mirror the JSON shapes returned by the FastAPI endpoints in
// ``src/novelist_brain/web/app.py`` (Phase 1 of the WebUI refactor).

export interface LinYiProfile {
  name: string
  pen_name: string
  values: string[]
  traits: Record<string, number>
  interests: string[]
  self_narrative: string
  rhythm_preferences: {
    preferred_writing_hours: number[]
    sleep_start: number
    wake_up: number
    peak_energy: number
    meal_times: number[]
  }
  integrity_score: number
  voice_signature: {
    sentence_rhythm: string
    sensory_bias: string
    emotional_register: string
    favorite_images: string[]
  }
  internal_conflict: string
  habits: {
    morning: string
    daytime: string
    evening: string
    night: string
    quirks: string[]
  }
  anchors: {
    home: string
    objects: string[]
    places: string[]
  }
  current_novel: {
    title: string
    theme: string
    protagonist: string
    setting: string
  }
  childhood_memory: string
  baseline_mood: {
    valence: number
    arousal: number
    dominance: number
  }
  voice: string
}

export interface IdentityResponse {
  profile: LinYiProfile
  constraints: Record<string, unknown>
  state: Record<string, unknown>
}

export interface IdentityHistoryEntry {
  timestamp: string
  field: string
  delta: number
  reason: string
}

export interface IdentityHistoryResponse {
  history: IdentityHistoryEntry[]
}

export interface SchedulePhase {
  id: string
  phase_type: string
  planned_start: string
  planned_end: string
  planned_start_minutes: number
  planned_end_minutes: number
  planned_duration_minutes: number
  min_duration_minutes: number
  max_duration_minutes: number
  energy_budget: number
  preferred_network: string
}

export interface CurrentPhaseInfo {
  id: string
  phase_type: string
  planned_start: string
  planned_end: string
  preferred_network: string
  energy_budget: number
}

export interface ScheduleResponse {
  schedule: {
    date: string | null
    fallback: boolean
    phases: SchedulePhase[]
    current_phase_info: CurrentPhaseInfo | null
  }
  clock: {
    tick: number
    hour: number
    phase: string
    absolute_time_ms: number
    now: string | null
    is_fast_forward: boolean
    tick_interval_seconds: number
    energy?: number
  }
  energy_history: number[]
}

export interface NetworksStateResponse {
  phase: string
  hour: number
  energy: number
  mood: Record<string, number> | null
  alert_count: number
  networks: {
    sn: Record<string, unknown>
    dmn: Record<string, unknown>
    cen: Record<string, unknown>
  }
  metabolism: Record<string, unknown>
}

export interface SnapshotResponse {
  started_at: number | null
  uptime_seconds: number
  modules: Record<string, Record<string, unknown>>
  context: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Phase 2 types
// ---------------------------------------------------------------------------

export interface Fragment {
  id: string
  content: string
  source: string
  modality: string
  valence: number
  arousal: number
  salience: number
  timestamp: number
  tags: string[]
  image_url: string | null
}

export interface Trace {
  id: string
  fragment_ids: string[]
  importance: number
  recency: number
  relevance: number
  emotional_weight: number
  narrative_role: string
  content: string
  tags: string[]
  // SocialTrace extensions (optional)
  space_id?: string
  role_id?: string
  relationship_delta?: Record<string, unknown>
  gaze_pressure?: number
  dialogue_mode?: string
}

export interface DmnReflectionsResponse {
  reflections: Fragment[]
  mood_estimate: { valence: number; arousal: number } | null
}

export interface EosAlert {
  metric_id: string
  metric_name: string
  severity: string
  value: number
  threshold: Record<string, unknown>
}

export interface EosMetric {
  id: string
  name: string
  category: string
  value: number
  timestamp: number
  source: string
  tags: string[]
  raw_value: unknown
  unit: string
  threshold: Record<string, unknown> | null
  severity: string
}

export interface EosReport {
  id: string
  timestamp: number
  trigger: string
  metrics: EosMetric[]
  alerts: EosAlert[]
  recommendations: string[]
  summary: string
}

export interface EosReportsResponse {
  reports: EosReport[]
}

export interface MemoryFragmentsResponse {
  fragments: Fragment[]
  total: number
}

export interface MemoryTracesResponse {
  traces: Trace[]
  total: number
}

export interface MemoryGraphResponse {
  nodes: Array<{ id: string; label: string; type: string; role: string }>
  edges: Array<{ source: string; target: string; weight: number; shared_tags: string[] }>
}

// Phase 2 networks-state view uses the same NetworksStateResponse shape,
// but pulls more detail out of the networks object.
export interface NetworkModuleState {
  activation_level?: number
  current_theme?: string
  energy?: number
  phase?: string
  last_network?: string
  evaluation_count?: number
  switch_count?: number
  rejected_count?: number
  goal_stack?: Array<Record<string, unknown>>
  current_goal?: Record<string, unknown> | null
  current_task?: string
  executive_load?: number
  working_memory_count?: number
  sandbox_built?: boolean
  awaiting_ready?: boolean
  narrative_ready?: boolean
  reflection_buffer?: Fragment[]
  dream_queue?: Fragment[]
  wandering_traces?: Trace[]
  working_memory?: Fragment[]
  latest_traces?: Trace[]
  ab_in_progress?: boolean
  ab_versions?: string[]
  ab_rounds_remaining?: number
  ab_max_rounds?: number
  last_phase?: string
  wandering_trace_count?: number
  dream_queue_count?: number
  reflection_buffer_count?: number
  identity_constraints?: Record<string, unknown>
  [k: string]: unknown
}

// ---------------------------------------------------------------------------
// Phase 3-5 types
// ---------------------------------------------------------------------------

export interface SocialSpace {
  id: string
  name: string
  space_type: string
  spatial_practice?: string[]
  representations_of_space?: string[]
  representational_space?: string[]
  norms?: Array<{ id: string; description: string; violation_cost: number; gaze_intensity: number }>
  gaze_intensity?: number
  encounter_base_rate?: number
  total_gaze?: number
}

export interface SocialRole {
  id: string
  name: string
  space_ids: string[]
  front_stage_persona?: string
  back_stage_persona?: string
  goals?: string[]
  risks?: string[]
  encounter_affinity?: number
  energy_cost_multiplier?: number
}

export interface SocialNPC {
  id: string
  name: string
  space_ids: string[]
  archetype: string
  initial_intensity: number
  initial_trust: number
  recurrence_weight: number
}

export interface Relationship {
  target_id: string
  target_name: string
  type: string
  intensity: number
  trust: number
  history: string[]
}

export interface GazePressure {
  source: string
  norm: string
  intensity: number
  internalized: number
}

export interface SocialEncounter {
  id: string
  space_id: string
  encounter_type: string
  participants: string[]
  dialogue_mode: string
  content: string
  valence: number
  arousal: number
  salience: number
  gaze_pressure: number
  cost?: {
    energy_drain?: number
    attention_drain?: number
    emotional_exposure?: number
  }
  relationship_delta?: {
    target_id: string
    target_name: string
    type: string
    delta: number
  } | null
  timestamp: number
  tags: string[]
}

export interface SocialStateResponse {
  module?: string
  timestamp?: number
  current?: {
    space: SocialSpace | null
    role: SocialRole | null
    space_gaze?: number
    social_energy: number
    accumulated_gaze_load: number
    energy_ratio?: number
  }
  spaces: SocialSpace[]
  roles: SocialRole[]
  npcs: SocialNPC[]
  relationships: Relationship[]
  gaze_pressures: GazePressure[]
  recent_encounters: SocialEncounter[]
  summary?: {
    fragment_count: number
    encounter_count: number
    relationship_count: number
    gaze_pressure_count: number
    recent_encounter_count: number
    spaces_count: number
    roles_count: number
    npcs_count: number
  }
}

// Phase 3 #22: NPC detail + dialogue history
export interface NpcDetailResponse {
  npc: SocialNPC
  relationship: Relationship | null
  encounter_count: number
  last_seen_timestamp: number | null
}

export interface NpcHistoryResponse {
  npc_id: string
  encounters: SocialEncounter[]
  count: number
}

// Phase 4: 脑中世界
export interface WorldModel {
  id?: string
  name: string
  ontology: Record<string, unknown>
  rules: string[]
  history: string[]
  current_state: Record<string, unknown>
  prediction_errors: Array<Record<string, unknown>>
  campaign_arc?: Record<string, unknown>
}

export interface CharacterProjection {
  id: string
  name: string
  archetype: string
  source_trace_ids?: string[]
  traits?: Record<string, number>
  skills?: Record<string, number>
  sanity?: Record<string, unknown>
  desires?: string[]
  fears?: string[]
  relationships?: Relationship[]
  internal_conflict?: string
  projection_ratio?: number
}

export interface Scene {
  id: string
  description: string
  characters: string[]
  setting: string
  conflict_level: number
  emotional_tone: number
}

export interface NarrativeLine {
  id: string
  scenes: Scene[]
  conflicts: Array<Record<string, unknown>>
  foreshadowing: string[]
  climax: Scene | null
  status: string
}

export interface SandboxVersion {
  id: string
  parent_id: string | null
  label: string
  created_at: number
  sandbox_dict: Record<string, unknown>
  simulation_round: number
  results: Array<Record<string, unknown>>
  metrics: Record<string, unknown>
  status: string
}

export interface SandboxStateResponse {
  world_model: WorldModel | null
  characters: CharacterProjection[]
  current_scene: Scene | null
  narrative_lines: NarrativeLine[]
  character_sheets: Record<string, Record<string, unknown>>
  version_manager: {
    tree: {
      versions: Record<string, SandboxVersion>
      root_id: string | null
    }
    current_version_id: string | null
    max_versions: number
  } | null
  simulation_round: number
  depth_metrics?: {
    conflict_depth?: number
    character_development?: number
    emotional_shift?: number
    coherence_score?: number
  }
  min_rounds?: number
  max_rounds?: number
  [k: string]: unknown
}

// Phase 4: 小说手稿
export interface NovelManuscriptResponse {
  title: string
  author_name: string
  version: number
  paragraphs: string[]
  paragraph_count: number
  published_count: number
  latest_paragraph: string | null
  world_settings: Record<string, unknown>
}

// Phase 5: 总线事件流
export interface BusEvent {
  id?: string | number
  timestamp: number
  source: string
  topic: string
  channel: string
  priority?: number
  payload?: unknown
}

// Phase 5: 配置管理 — NovelistConfig has many sections; treat as nested dict.
export interface ConfigResponse {
  [section: string]: Record<string, unknown> | unknown
}
