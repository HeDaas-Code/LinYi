<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ gazeIntensity: number }>()
const overlayStyle = computed(() => {
  const g = props.gazeIntensity
  if (g > 0.3) return { background: 'rgba(255, 0, 0, 0.15)' }
  if (g > 0.15) return { background: 'rgba(255, 200, 0, 0.10)' }
  return { background: 'rgba(0, 255, 100, 0.08)' }
})
const overlayLabel = computed(() => {
  const g = props.gazeIntensity
  if (g > 0.3) return '高凝视'
  if (g > 0.15) return '中凝视'
  return '低凝视'
})
</script>
<template>
  <div class="gaze-overlay" :style="overlayStyle">
    <span class="gaze-label">{{ overlayLabel }} · {{ gazeIntensity.toFixed(2) }}</span>
  </div>
</template>
<style scoped>
.gaze-overlay {
  position: absolute;
  top: 8px; right: 8px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  pointer-events: none;
  color: var(--text-primary);
  border: 1px solid var(--border-soft);
  backdrop-filter: blur(4px);
}
.gaze-label { font-family: var(--font-mono); }
</style>
