<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import { useAgentStore } from '@/stores/agent'
import { useAgentSnapshot } from '@/composables/useAgentSnapshot'

// Root component: 240px sidebar grouped by the 4 areas defined in
// docs/WEBUI-REFACTOR.md §4.2 + 56px topbar + scrollable content slot.

interface NavItem {
  path: string
  title: string
}

interface NavArea {
  id: string
  label: string
  accent: 'linyi' | 'brain' | 'world' | 'system'
  items: NavItem[]
}

const AREAS: NavArea[] = [
  {
    id: 'linyi',
    label: '林逸',
    accent: 'linyi',
    items: [
      { path: '/identity', title: '人格画像' },
      { path: '/dream', title: '日记·反思' },
    ],
  },
  {
    id: 'brain',
    label: '脑内网络',
    accent: 'brain',
    items: [
      { path: '/networks', title: '网络状态' },
      { path: '/schedule', title: '日程节律' },
      { path: '/memory', title: '记忆宫殿' },
      { path: '/sandbox', title: '脑中世界' },
    ],
  },
  {
    id: 'world',
    label: '外部世界',
    accent: 'world',
    items: [
      { path: '/social', title: '社会空间' },
      { path: '/novel', title: '小说手稿' },
    ],
  },
  {
    id: 'system',
    label: '系统',
    accent: 'system',
    items: [
      { path: '/eos', title: 'EOS 观测台' },
      { path: '/bus', title: '总线事件流' },
      { path: '/config', title: '配置管理' },
    ],
  },
]

const route = useRoute()
const store = useAgentStore()
const { start } = useAgentSnapshot()

const activePath = computed(() => route.path)

const currentTitle = computed(() => {
  const meta = route.meta?.title as string | undefined
  return meta ?? '林逸观测台'
})

function isActive(path: string): boolean {
  return activePath.value === path
}

function areaClass(area: NavArea['accent']): string {
  return `area-${area}`
}

onMounted(async () => {
  // Initial fetch so the topbar shows phase + energy immediately, then
  // the composable takes over with periodic polling + WS.
  await Promise.all([
    store.fetchNetworks(),
    store.fetchIdentity(),
    store.fetchSchedule(),
  ])
  start()
})
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar">
      <div class="brand">
        <div class="brand-mark">林</div>
        <div class="brand-text">
          <div class="brand-title">林逸观测台</div>
          <div class="brand-sub">脑中世界 · 实时控制台</div>
        </div>
      </div>

      <nav class="nav">
        <section v-for="area in AREAS" :key="area.id" class="nav-area" :class="areaClass(area.accent)">
          <h3 class="nav-area-label">{{ area.label }}</h3>
          <ul>
            <li v-for="item in area.items" :key="item.path">
              <router-link
                :to="item.path"
                class="nav-link"
                :class="{ active: isActive(item.path) }"
              >
                <span class="nav-dot" />
                <span>{{ item.title }}</span>
              </router-link>
            </li>
          </ul>
        </section>
      </nav>

      <div class="sidebar-footer">
        <span class="muted">v0.1.0 · Phase 1</span>
      </div>
    </aside>

    <TopBar :title="currentTitle" />

    <main class="app-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border-soft);
}

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--dmn), var(--cen));
  color: var(--text-inverse);
  font-weight: 700;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.brand-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.nav {
  flex: 1;
  padding: 12px 8px;
}

.nav-area {
  margin-bottom: 16px;
}

.nav-area-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-muted);
  margin: 8px 12px 6px;
}

.nav-area ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  transition: background 0.15s var(--ease-out), color 0.15s var(--ease-out);
}

.nav-link:hover {
  background: var(--bg-2);
  color: var(--text-primary);
  text-decoration: none;
}

.nav-link.active {
  background: var(--bg-3);
  color: var(--text-primary);
}

.nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.area-linyi .nav-link.active .nav-dot {
  background: var(--dmn);
}
.area-brain .nav-link.active .nav-dot {
  background: var(--cen);
}
.area-world .nav-link.active .nav-dot {
  background: var(--sn);
}
.area-system .nav-link.active .nav-dot {
  background: var(--text-secondary);
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-soft);
  font-size: 11px;
}
</style>
