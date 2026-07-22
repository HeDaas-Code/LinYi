<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

// PlaceholderView — used for the 9 views not yet implemented in Phase 1.
//
// Each placeholder shows the view title, which Phase will deliver it, and a
// short description pulled from docs/WEBUI-REFACTOR.md. This keeps the
// navigation working end-to-end and makes the rollout plan visible to users
// who land on an unbuilt page.

interface PlaceholderMeta {
  phase: number
  description: string
  dependencies?: string[]
}

const META: Record<string, PlaceholderMeta> = {
  dream: {
    phase: 2,
    description: '日记·反思视图，展示每日反思日志与情绪轨迹。',
  },
  networks: {
    phase: 2,
    description: 'SN / DMN / CEN 三网络状态可视化，包含切换事件与能量分布。',
  },
  memory: {
    phase: 2,
    description: '记忆宫殿时间线：Fragment → Trace 巩固流，按 tag 检索。',
    dependencies: ['d3.js', '记忆系统 export_graph'],
  },
  sandbox: {
    phase: 4,
    description: '脑中世界沙盘：TRPG 场景、人物卡、A/B 版本对比。',
    dependencies: ['pixijs', 'sandbox world_model'],
  },
  social: {
    phase: 3,
    description: '社会空间视图：场所、NPC 关系网、社交能量条。',
    dependencies: ['pixijs'],
  },
  novel: {
    phase: 4,
    description: '小说手稿阅读器 + 段落生成溯源（sandbox / creation 链路）。',
  },
  eos: {
    phase: 2,
    description: 'EOS 观测台：8 个 Collector 的实时指标 + 阈值告警。',
  },
  bus: {
    phase: 5,
    description: '总线事件流：实时 BusSpy 流，按 channel / topic 过滤。',
  },
  config: {
    phase: 5,
    description: '配置管理：在线查看 / 调整 NovelistConfig 各 section。',
  },
}

const route = useRoute()

const title = computed(() => (route.meta?.title as string | undefined) ?? '未命名视图')

const meta = computed<PlaceholderMeta | null>(() => {
  const name = route.name as string | undefined
  if (!name) return null
  return META[name] ?? null
})
</script>

<template>
  <div class="placeholder-view">
    <div class="placeholder-card">
      <div class="placeholder-icon">{{ title.charAt(0) }}</div>
      <h1 class="placeholder-title">{{ title }}</h1>

      <div class="phase-badge" v-if="meta">
        Phase {{ meta.phase }}
        <span class="dot" />
        未实现
      </div>

      <p class="placeholder-desc" v-if="meta">{{ meta.description }}</p>
      <p class="placeholder-desc muted" v-else>
        此视图尚未在路线图中明确；请联系开发者补充。
      </p>

      <div class="dep-block" v-if="meta?.dependencies?.length">
        <h3 class="dep-title">依赖项</h3>
        <ul class="dep-list">
          <li v-for="d in meta.dependencies" :key="d">{{ d }}</li>
        </ul>
      </div>

      <div class="hint">
        请参考 <code>docs/WEBUI-REFACTOR.md</code> 第 {{ meta?.phase ?? '?' }} 阶段获取详细设计。
      </div>
    </div>
  </div>
</template>

<style scoped>
.placeholder-view {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 40px 0;
}

.placeholder-card {
  max-width: 520px;
  width: 100%;
  background: var(--bg-1);
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 40px 32px;
  text-align: center;
}

.placeholder-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--bg-3), var(--bg-2));
  border: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  color: var(--text-secondary);
}

.placeholder-title {
  margin: 0 0 8px 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
}

.phase-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 12px;
  background: var(--bg-3);
  color: var(--text-secondary);
  font-size: 11px;
  border: 1px solid var(--border-soft);
  margin-bottom: 20px;
}

.phase-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warn);
}

.placeholder-desc {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  margin: 0 0 24px 0;
}

.dep-block {
  text-align: left;
  background: var(--bg-2);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.dep-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 6px 0;
  font-weight: 600;
}

.dep-list {
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary);
  font-size: 12px;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
}

.hint code {
  background: var(--bg-3);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
}
</style>
