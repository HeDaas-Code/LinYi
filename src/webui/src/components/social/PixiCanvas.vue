<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref, shallowRef, type Ref } from 'vue'
import * as PIXI from 'pixi.js'
import type { Application, Container, Texture } from 'pixi.js'
import { useAgentStore } from '@/stores/agent'
import { usePixiApp } from '@/composables/usePixiApp'
import { usePixiViewport } from '@/composables/usePixiViewport'
import { useCharacterSprite } from '@/composables/useCharacterSprite'
import type {
  SocialNPC,
  SocialSpace,
  CharacterSpriteState,
  SpritesheetData,
  TilemapData,
  TileLayer,
  AnimatedSpriteLayer,
  AnimatedSpriteObject,
} from '@/types'

const props = defineProps<{
  spaceId: string
  space: SocialSpace | null
  npcs: SocialNPC[]
  currentNpcId: string | null
  linyiX: number
  linyiY: number
}>()
const emit = defineEmits<{ (e: 'select-npc', npcId: string): void }>()

const store = useAgentStore()
const containerRef = ref<HTMLElement | null>(null)
const { app, ensureApp, destroyApp } = usePixiApp(containerRef)
// `app` is ShallowRef<Application | null>; usePixiViewport's signature asks for
// Ref<Application | null>. The runtime accepts both — the structural mismatch
// is only at the type-level because ShallowRef carries a phantom marker.
const { createViewport, destroyViewport } = usePixiViewport(app as unknown as Ref<Application | null>)
const { loadSpritesheet, createSprite } = useCharacterSprite()

const loading = ref(true)
const error = ref<string | null>(null)

// All per-space PIXI artifacts live inside the viewport; replacing the viewport
// (createViewport destroys the previous one) is enough to free textures held by
// children when `app.destroy(true, { texture: true, ... })` runs on unmount.
// We still keep a shallowRef map so the select-Npc watch can tint sprites
// without reloading the whole space.
const characterSprites = shallowRef<Map<string, PIXI.AnimatedSprite>>(new Map())
// Persistent npc positions across re-renders within the same space.
const npcPositionMap = shallowRef<Map<string, { x: number; y: number }>>(new Map())

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h
}

function npcPosition(
  npc: SocialNPC,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number } {
  const cached = npcPositionMap.value.get(npc.id)
  if (cached) return cached
  const h = hashString(npc.id)
  // Distribute around the map center on one of three concentric rings with
  // an 8-slice angular jitter, so each NPC has a stable per-id slot.
  const cx = worldWidth / 2
  const cy = worldHeight / 2
  const ring = h % 3
  const angleIdx = (h >> 4) % 8
  const angle = (angleIdx / 8) * Math.PI * 2
  const radius = 40 + ring * 36
  const pos = {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  }
  npcPositionMap.value.set(npc.id, pos)
  return pos
}

function getProp(
  obj: AnimatedSpriteObject,
  name: string,
  fallback: number,
): number {
  const found = obj.properties.find((p) => p.name === name)
  if (!found) return fallback
  return Number(found.value)
}

function renderTilemap(
  vp: Container,
  tilemap: TilemapData,
  baseTexture: Texture,
): void {
  const tileset = tilemap.tilesets[0]
  const firstgid = tileset.firstgid
  const columns = tileset.columns
  const tileWidth = tilemap.tilewidth
  const tileHeight = tilemap.tileheight

  for (const layer of tilemap.layers) {
    if (layer.type === 'tilelayer') {
      const tl = layer as TileLayer
      for (let i = 0; i < tl.data.length; i++) {
        const gid = tl.data[i]
        if (gid <= 0) continue
        const tileIdx = gid - firstgid
        const tx = (tileIdx % columns) * tileWidth
        const ty = Math.floor(tileIdx / columns) * tileHeight
        const frame = new PIXI.Rectangle(tx, ty, tileWidth, tileHeight)
        const texture = new PIXI.Texture({ source: baseTexture.source, frame })
        const sprite = new PIXI.Sprite(texture)
        const col = i % tl.width
        const row = Math.floor(i / tl.width)
        sprite.x = col * tileWidth
        sprite.y = row * tileHeight
        vp.addChild(sprite)
      }
    } else if (layer.type === 'objectgroup' && layer.name === 'animatedSprites') {
      const al = layer as AnimatedSpriteLayer
      for (const obj of al.objects) {
        const tileId = getProp(obj, 'tileId', 1)
        const frames = Math.max(1, getProp(obj, 'frames', 2))
        const fps = getProp(obj, 'fps', 4)
        const textures: Texture[] = []
        for (let f = 0; f < frames; f++) {
          const tileIdx = tileId + f - firstgid
          const tx = (tileIdx % columns) * tileWidth
          const ty = Math.floor(tileIdx / columns) * tileHeight
          const frame = new PIXI.Rectangle(tx, ty, tileWidth, tileHeight)
          textures.push(new PIXI.Texture({ source: baseTexture.source, frame }))
        }
        const animSprite = new PIXI.AnimatedSprite(textures)
        animSprite.x = obj.x
        animSprite.y = obj.y
        animSprite.animationSpeed = fps / 60
        animSprite.play()
        vp.addChild(animSprite)
      }
    }
  }
}

async function loadSpritesheetData(characterId: string): Promise<SpritesheetData | null> {
  try {
    const res = await fetch(`/assets/spritesheets/${encodeURIComponent(characterId)}.json`)
    if (!res.ok) return null
    return (await res.json()) as SpritesheetData
  } catch {
    return null
  }
}

async function renderLinyi(vp: Container): Promise<void> {
  const data = await loadSpritesheetData('linyi')
  if (!data) return
  let textures: Texture[]
  try {
    textures = await loadSpritesheet('/assets/spritesheets/linyi.png', data)
  } catch {
    return
  }
  const state: CharacterSpriteState = {
    id: 'linyi',
    name: '林逸',
    x: props.linyiX,
    y: props.linyiY,
    direction: 'down',
    isMoving: false,
    isViewer: true,
  }
  const sprite = createSprite(textures, state)
  // Golden ellipse base marks the viewer (林逸) on the map.
  const base = new PIXI.Graphics()
  base.ellipse(0, 0, 14, 5)
  base.fill({ color: 0xd4af37, alpha: 0.55 })
  base.x = props.linyiX
  base.y = props.linyiY + 8
  vp.addChild(base)
  vp.addChild(sprite)
  characterSprites.value.set('linyi', sprite)
}

async function renderNpcs(
  vp: Container,
  worldWidth: number,
  worldHeight: number,
): Promise<void> {
  for (const npc of props.npcs) {
    const data = await loadSpritesheetData(npc.id)
    if (!data) continue
    let textures: Texture[]
    try {
      textures = await loadSpritesheet(`/assets/spritesheets/${encodeURIComponent(npc.id)}.png`, data)
    } catch {
      continue
    }
    const pos = npcPosition(npc, worldWidth, worldHeight)
    const state: CharacterSpriteState = {
      id: npc.id,
      name: npc.name,
      x: pos.x,
      y: pos.y,
      direction: 'down',
      isMoving: false,
      isViewer: false,
    }
    const sprite = createSprite(textures, state)
    sprite.eventMode = 'static'
    sprite.cursor = 'pointer'
    sprite.on('pointertap', () => emit('select-npc', npc.id))
    // Hit area covers the full 32×32 frame so the clickable region is
    // forgiving even though the sprite anchor is (0.5, 0.8).
    sprite.hitArea = new PIXI.Rectangle(-16, -26, 32, 32)
    if (props.currentNpcId === npc.id) {
      sprite.tint = 0xffeeaa
    }
    vp.addChild(sprite)
    characterSprites.value.set(npc.id, sprite)
  }
}

async function loadSpace(spaceId: string): Promise<void> {
  const application = app.value
  if (!application) {
    error.value = 'PIXI Application 未就绪'
    return
  }
  loading.value = true
  error.value = null
  try {
    const tileRes = await fetch(`/assets/tilemaps/${encodeURIComponent(spaceId)}/tilemap.json`)
    if (!tileRes.ok) throw new Error(`加载 tilemap 失败: ${tileRes.status}`)
    const tilemap = (await tileRes.json()) as TilemapData

    const tilesetUrl = `/assets/tilemaps/${encodeURIComponent(spaceId)}/tileset.png`
    const baseTexture = (await PIXI.Assets.load(tilesetUrl)) as Texture

    const worldWidth = tilemap.width * tilemap.tilewidth
    const worldHeight = tilemap.height * tilemap.tileheight

    // createViewport destroys the previous viewport (and its children) for us.
    const vp = createViewport(worldWidth, worldHeight)
    if (!vp) throw new Error('viewport 创建失败')
    // Viewport's .d.ts is the legacy @pixi/display@6 Container, which is
    // structurally incompatible with pixi.js v8's ContainerChild. The runtime
    // instance IS a v8 Container, so cast before passing to render helpers.
    const vpContainer = vp as unknown as Container

    // Reset per-space state. New Map instances so any stale closures that
    // captured the old Map stop mutating the live one.
    characterSprites.value = new Map()
    npcPositionMap.value = new Map()

    renderTilemap(vpContainer, tilemap, baseTexture)
    await renderLinyi(vpContainer)
    await renderNpcs(vpContainer, worldWidth, worldHeight)

    // Cache the loaded tilemap in the agent store so the parent (SocialView)
    // can show a loading banner / act on errors.
    store.socialMap = tilemap

    loading.value = false
  } catch (e) {
    error.value = (e as Error).message
    loading.value = false
  }
}

async function initCanvas(): Promise<void> {
  try {
    await ensureApp()
    if (props.spaceId) {
      await loadSpace(props.spaceId)
    } else {
      loading.value = false
    }
  } catch (e) {
    error.value = (e as Error).message
    loading.value = false
  }
}

onMounted(() => {
  void initCanvas()
})

watch(
  () => props.spaceId,
  async (newId, oldId) => {
    if (newId && newId !== oldId) {
      await loadSpace(newId)
    }
  },
)

watch(
  () => props.currentNpcId,
  (newId) => {
    for (const [id, sprite] of characterSprites.value) {
      if (id === 'linyi') continue
      sprite.tint = id === newId ? 0xffeeaa : 0xffffff
    }
  },
)

onBeforeUnmount(() => {
  destroyViewport()
  destroyApp()
})
</script>

<template>
  <div class="pixi-canvas-root">
    <div ref="containerRef" class="pixi-canvas-container" />
    <div v-if="loading" class="pixi-canvas-loading">地图加载中…</div>
    <div v-else-if="error" class="pixi-canvas-error">
      加载失败：{{ error }}
    </div>
  </div>
</template>

<style scoped>
.pixi-canvas-root {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bg-0);
}
.pixi-canvas-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.pixi-canvas-container :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
.pixi-canvas-loading,
.pixi-canvas-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  color: var(--text-muted);
  pointer-events: none;
  background: rgba(10, 13, 20, 0.7);
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
}
.pixi-canvas-error {
  color: var(--error);
  max-width: 80%;
  text-align: center;
}
</style>
