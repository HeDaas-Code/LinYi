import { AnimatedSprite, Assets, Texture, Rectangle } from 'pixi.js'
import type { SpritesheetData, CharacterSpriteState } from '@/types'

const textureCache = new Map<string, Texture[]>()

export function useCharacterSprite() {
  async function loadSpritesheet(pngUrl: string, data: SpritesheetData): Promise<Texture[]> {
    const cacheKey = pngUrl
    if (textureCache.has(cacheKey)) {
      return textureCache.get(cacheKey)!
    }
    const baseTexture = await Assets.load(pngUrl)
    const { w, h } = data.frameSize
    const textures: Texture[] = []
    for (let i = 0; i < data.frames; i++) {
      const col = i % 4
      const row = Math.floor(i / 4)
      const frame = new Rectangle(col * w, row * h, w, h)
      textures.push(new Texture({ source: baseTexture.source, frame }))
    }
    textureCache.set(cacheKey, textures)
    return textures
  }

  function createSprite(textures: Texture[], state: CharacterSpriteState): AnimatedSprite {
    const sprite = new AnimatedSprite(textures)
    sprite.anchor.set(0.5, 0.8)
    sprite.x = state.x
    sprite.y = state.y
    sprite.animationSpeed = 0.08
    // Set initial direction's first frame
    setDirection(sprite, state.direction)
    if (state.isMoving) {
      sprite.play()
    } else {
      sprite.stop()
      // first frame of current direction
      sprite.gotoAndStop(0)
    }
    return sprite
  }

  function setDirection(sprite: AnimatedSprite, direction: CharacterSpriteState['direction']): void {
    // animations indices in spritesheet:
    // down=[0,1,2,3] left=[4,5,6,7] right=[8,9,10,11] up=[12,13,14,15]
    const offsets: Record<CharacterSpriteState['direction'], number> = {
      down: 0,
      left: 4,
      right: 8,
      up: 12,
    }
    const baseIdx = offsets[direction]
    // Set current frame to first frame of new direction
    sprite.gotoAndStop(baseIdx)
  }

  function setMoving(sprite: AnimatedSprite, moving: boolean, direction?: CharacterSpriteState['direction']): void {
    if (direction) setDirection(sprite, direction)
    if (moving) {
      sprite.play()
    } else {
      sprite.stop()
    }
  }

  return { loadSpritesheet, createSprite, setDirection, setMoving }
}
