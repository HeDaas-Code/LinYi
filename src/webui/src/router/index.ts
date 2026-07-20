import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

// Routes follow the 4-area / 11-view layout from docs/WEBUI-REFACTOR.md §4.2.
// Phase 1 implements Identity (人格画像) and Schedule (日程节律). Other
// views are stubbed with PlaceholderView so navigation works end-to-end.
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/identity' },
  {
    path: '/identity',
    name: 'identity',
    component: () => import('@/views/IdentityView.vue'),
    meta: { title: '人格画像', area: 'linyi' },
  },
  {
    path: '/dream',
    name: 'dream',
    component: () => import('@/views/DreamView.vue'),
    meta: { title: '日记·反思', area: 'linyi' },
  },
  {
    path: '/networks',
    name: 'networks',
    component: () => import('@/views/NetworksView.vue'),
    meta: { title: '网络状态', area: 'brain' },
  },
  {
    path: '/schedule',
    name: 'schedule',
    component: () => import('@/views/ScheduleView.vue'),
    meta: { title: '日程节律', area: 'brain' },
  },
  {
    path: '/memory',
    name: 'memory',
    component: () => import('@/views/MemoryView.vue'),
    meta: { title: '记忆宫殿', area: 'brain' },
  },
  {
    path: '/sandbox',
    name: 'sandbox',
    component: () => import('@/views/SandboxView.vue'),
    meta: { title: '脑中世界', area: 'brain' },
  },
  {
    path: '/social',
    name: 'social',
    component: () => import('@/views/SocialView.vue'),
    meta: { title: '社会空间', area: 'world' },
  },
  {
    path: '/novel',
    name: 'novel',
    component: () => import('@/views/NovelView.vue'),
    meta: { title: '小说手稿', area: 'world' },
  },
  {
    path: '/eos',
    name: 'eos',
    component: () => import('@/views/EosView.vue'),
    meta: { title: 'EOS 观测台', area: 'system' },
  },
  {
    path: '/bus',
    name: 'bus',
    component: () => import('@/views/BusView.vue'),
    meta: { title: '总线事件流', area: 'system' },
  },
  {
    path: '/config',
    name: 'config',
    component: () => import('@/views/ConfigView.vue'),
    meta: { title: '配置管理', area: 'system' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.afterEach((to) => {
  const title = (to.meta?.title as string | undefined) ?? '林逸观测台'
  document.title = `${title} · 脑中世界`
})

export default router
