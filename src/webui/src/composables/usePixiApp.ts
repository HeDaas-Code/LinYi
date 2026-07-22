import { onBeforeUnmount, ref, shallowRef, type Ref } from 'vue'
import { Application } from 'pixi.js'

export function usePixiApp(containerRef: Ref<HTMLElement | null>) {
  // shallowRef (not ref): Vue's `ref` deeply unwraps the value via UnwrapRef<T>,
  // which strips pixi.js v8 Container's private fields (_worldTransform, etc.)
  // from the `stage` property and would also wrap the live Application in a
  // reactivity Proxy — breaking PixiJS rendering. shallowRef keeps the instance
  // opaque, which is the documented Vue 3 pattern for class instances.
  const app = shallowRef<Application | null>(null)
  const ready = ref(false)

  async function ensureApp(): Promise<Application | null> {
    if (!containerRef.value) return null
    if (app.value) return app.value
    const instance = new Application()
    await instance.init({
      background: '#0a0d14',
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: containerRef.value,
    })
    containerRef.value.appendChild(instance.canvas)
    app.value = instance
    ready.value = true
    return instance
  }

  function destroyApp(): void {
    if (app.value) {
      app.value.destroy(true, { children: true, texture: true, textureSource: true })
      app.value = null
      ready.value = false
    }
  }

  onBeforeUnmount(() => destroyApp())

  return { app, ready, ensureApp, destroyApp }
}
