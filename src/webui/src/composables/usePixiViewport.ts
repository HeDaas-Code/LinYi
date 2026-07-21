import { shallowRef, type Ref } from 'vue'
import { type Application, type Container } from 'pixi.js'
import { Viewport } from 'pixi-viewport'

export function usePixiViewport(appRef: Ref<Application | null>) {
  // shallowRef: same rationale as usePixiApp — Viewport extends Container and
  // must not be wrapped in a deep reactivity Proxy.
  const viewport = shallowRef<Viewport | null>(null)

  function createViewport(worldWidth: number, worldHeight: number): Viewport | null {
    const app = appRef.value
    if (!app) return null
    // Clean up previous viewport if exists
    if (viewport.value) {
      viewport.value.destroy()
      viewport.value = null
    }
    // NOTE: pixi-viewport@5.1.0's bundled `index.d.ts` declares
    // `IViewportOptions` against the legacy `@pixi/display@6.x` types
    // (it exposes `interaction`, not `events`). The runtime ESM build
    // targets pixi.js v8 and REQUIRES `events: app.renderer.events`.
    // Cast the options bag to bypass the stale type definition.
    const vp = new Viewport({
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      worldWidth,
      worldHeight,
      events: app.renderer.events,
    } as unknown as ConstructorParameters<typeof Viewport>[0])
    vp.drag().pinch().wheel({ smooth: 5 }).decelerate({ friction: 0.92 })
    vp.clampZoom({ minWidth: 200, minHeight: 150, maxWidth: worldWidth * 3, maxHeight: worldHeight * 3 })
    // `Viewport` extends the legacy `@pixi/display` Container in the .d.ts,
    // which is structurally incompatible with pixi.js v8's `ContainerChild`.
    // The runtime instance IS a v8 Container, so cast for `addChild`.
    app.stage.addChild(vp as unknown as Container)
    viewport.value = vp
    return vp
  }

  function destroyViewport(): void {
    if (viewport.value) {
      viewport.value.destroy()
      viewport.value = null
    }
  }

  return { viewport, createViewport, destroyViewport }
}
