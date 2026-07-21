import { shallowRef, type Ref } from 'vue'
import { type Application } from 'pixi.js'
import { Viewport } from 'pixi-viewport'

export function usePixiViewport(appRef: Ref<Application | null>) {
  // shallowRef: same rationale as usePixiApp — Viewport extends Container and
  // must not be wrapped in a deep reactivity Proxy.
  const viewport = shallowRef<Viewport | null>(null)

  function createViewport(worldWidth: number, worldHeight: number): Viewport | null {
    const app = appRef.value
    if (!app) return null
    // Clean up previous viewport if exists. Explicitly remove from stage first
    // so a destroyed viewport is never left in app.stage.children.
    if (viewport.value) {
      viewport.value.removeFromParent()
      viewport.value.destroy()
      viewport.value = null
    }
    // pixi-viewport@6.x targets pixi.js v8; `events: app.renderer.events`
    // is the correct option for the v8 event system.
    const vp = new Viewport({
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      worldWidth,
      worldHeight,
      events: app.renderer.events,
    })
    vp.drag().pinch().wheel({ smooth: 5 }).decelerate({ friction: 0.92 })
    vp.clampZoom({ minWidth: 200, minHeight: 150, maxWidth: worldWidth * 3, maxHeight: worldHeight * 3 })
    app.stage.addChild(vp)
    viewport.value = vp
    return vp
  }

  function destroyViewport(): void {
    if (viewport.value) {
      viewport.value.removeFromParent()
      viewport.value.destroy()
      viewport.value = null
    }
  }

  return { viewport, createViewport, destroyViewport }
}
