<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import { useAgentStore } from '@/stores/agent'
import { useAgentSnapshot } from '@/composables/useAgentSnapshot'

// Root component: 240px sidebar grouped by the 4 areas defined in
// docs/WEBUI-REFACTOR.md §4.2 + 56px topbar + scrollable content slot.
//
// Mobile (Phase 6): sidebar collapses into a slide-in drawer triggered by a
// hamburger button in the topbar; a bottom tab bar shows the 4 areas for
// quick navigation. Drawer auto-closes on route change.

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
      { path: '/world', title: '世界图谱' },
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

// Mobile drawer state.
const drawerOpen = ref(false)
const isMobile = ref(false)

function checkMobile() {
  isMobile.value = typeof window !== 'undefined' && window.innerWidth < 768
}

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}

function closeDrawer() {
  drawerOpen.value = false
}

// Close drawer whenever the route changes (mobile UX).
watch(activePath, () => {
  drawerOpen.value = false
})

// Bottom tab: pick the first item of each area as its representative.
const tabItems = computed(() =>
  AREAS.map((area) => ({
    area: area.accent,
    label: area.label,
    path: area.items[0].path,
    active: area.items.some((i) => i.path === activePath.value),
  })),
)

function isActive(path: string): boolean {
  return activePath.value === path
}

function areaClass(area: NavArea['accent']): string {
  return `area-${area}`
}

onMounted(async () => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  // Initial fetch so the topbar shows phase + energy immediately, then
  // the composable takes over with periodic polling + WS.
  await Promise.all([
    store.fetchNetworks(),
    store.fetchIdentity(),
    store.fetchSchedule(),
  ])
  start()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', checkMobile)
  }
})
</script>

<template>
  <div class="app-shell" :class="{ 'drawer-open': drawerOpen, mobile: isMobile }">
    <!-- Mobile drawer backdrop -->
    <div v-if="drawerOpen" class="drawer-backdrop" @click="closeDrawer" />

    <aside class="app-sidebar" :class="{ open: drawerOpen }">
      <div class="brand">
        <div class="brand-mark">林</div>
        <div class="brand-text">
          <div class="brand-title">林逸观测台</div>
          <div class="brand-sub">脑中世界 · 实时控制台</div>
        </div>
        <button v-if="isMobile" class="btn-close-drawer" @click="closeDrawer" aria-label="关闭菜单">×</button>
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
        <span class="muted">v0.1.0 · Phase 6</span>
      </div>
    </aside>

    <TopBar :title="currentTitle" :is-mobile="isMobile" @toggle-drawer="toggleDrawer" />

    <main class="app-content">
      <router-view />
    </main>

    <!-- Mobile bottom tab bar (Phase 6) -->
    <nav v-if="isMobile" class="bottom-tabs">
      <router-link
        v-for="t in tabItems"
        :key="t.path"
        :to="t.path"
        :class="['bottom-tab', `area-${t.area}`, { active: t.active }]"
      >
        <span class="tab-dot" />
        <span class="tab-label">{{ t.label }}</span>
      </router-link>
    </nav>
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

.btn-close-drawer {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.btn-close-drawer:hover {
  color: var(--text-primary);
  background: var(--bg-3);
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

/* Mobile drawer (Phase 6) */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 50;
  animation: fade-in 0.2s var(--ease-out);
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.app-shell.mobile .app-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--sidebar-width);
  z-index: 60;
  transform: translateX(-100%);
  transition: transform 0.25s var(--ease-out);
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.3);
}

.app-shell.mobile.drawer-open .app-sidebar.open {
  transform: translateX(0);
}

.app-shell.mobile .app-content {
  padding-bottom: 64px; /* space for bottom tabs */
}

.bottom-tabs {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--bg-1);
  border-top: 1px solid var(--border-soft);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  z-index: 40;
}

.bottom-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-decoration: none;
  color: var(--text-muted);
  font-size: 10px;
  transition: color 0.15s var(--ease-out);
}

.bottom-tab.active {
  color: var(--text-primary);
}

.tab-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
}

.bottom-tab.area-linyi.active .tab-dot { background: var(--dmn); }
.bottom-tab.area-brain.active .tab-dot { background: var(--cen); }
.bottom-tab.area-world.active .tab-dot { background: var(--sn); }
.bottom-tab.area-system.active .tab-dot { background: var(--text-secondary); }

.bottom-tab.active.area-linyi { color: var(--dmn); }
.bottom-tab.active.area-brain { color: var(--cen); }
.bottom-tab.active.area-world { color: var(--sn); }
.bottom-tab.active.area-system { color: var(--text-secondary); }

.tab-label {
  font-weight: 500;
}
</style>
