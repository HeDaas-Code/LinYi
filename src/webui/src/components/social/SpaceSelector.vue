<script setup lang="ts">
import type { SocialSpace } from '@/types'

defineProps<{
  spaces: SocialSpace[]
  currentSpaceId: string
}>()
const emit = defineEmits<{ (e: 'change', spaceId: string): void }>()

function spaceTone(t: string): string {
  switch (t) {
    case 'public': return 'sn'
    case 'private': return 'dmn'
    case 'liminal': return 'cen'
    case 'sacred': return 'gold'
    case 'marginal': return 'warn'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="space-selector">
    <button
      v-for="s in spaces"
      :key="s.id"
      :class="['space-tab', `tone-${spaceTone(s.space_type)}`, { active: currentSpaceId === s.id }]"
      @click="emit('change', s.id)"
    >
      <span class="tab-name">{{ s.name }}</span>
      <span class="tab-type">{{ s.space_type }}</span>
    </button>
  </div>
</template>

<style scoped>
.space-selector {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 8px;
  background: var(--bg-2);
  border-radius: 8px;
  border: 1px solid var(--border-soft);
}
.space-tab {
  flex: 1;
  min-width: 100px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  transition: all 0.15s var(--ease-out);
  color: var(--text-secondary);
}
.space-tab:hover { background: var(--bg-3); }
.space-tab.active {
  background: var(--bg-3);
  color: var(--text-primary);
  border-color: var(--cen);
}
.tab-name { font-size: 13px; font-weight: 600; }
.tab-type { font-size: 10px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.06em; }
.space-tab.tone-sn.active { border-color: var(--sn); }
.space-tab.tone-dmn.active { border-color: var(--dmn); }
.space-tab.tone-cen.active { border-color: var(--cen); }
.space-tab.tone-gold.active { border-color: #d4af37; }
.space-tab.tone-warn.active { border-color: var(--warn); }
</style>
