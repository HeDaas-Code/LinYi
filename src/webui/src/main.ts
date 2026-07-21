import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'

// Vue 3 entry point for the LinYi WebUI dashboard (Phase 1+).
//
// The app is served either from the Vite dev server (port 5173, with proxy
// to FastAPI on 8000) or from the production build at
// ``src/novelist_brain/web/static/dist/index.html``.
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
