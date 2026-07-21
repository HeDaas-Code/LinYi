import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Vite config for the LinYi WebUI refactor (Phase 1+).
//
// - ``dev`` proxies /api, /ws, /health, /static to the FastAPI backend on
//   http://127.0.0.1:8000 so the Vue dev server can run on :5173 without CORS.
// - ``build`` emits the production bundle to
//   ``../novelist_brain/web/static/dist`` so FastAPI can serve it as the new
//   dashboard root without changing the existing /static mount.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/static': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../novelist_brain/web/static/dist', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
})
