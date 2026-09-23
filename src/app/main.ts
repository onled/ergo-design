import { createApp } from 'vue'
import { createErgoDesign, createHttpEngine } from '@onled/ergo-design'
import App from './App.vue'
import './app.css'

// Mesma origem sempre: em desenvolvimento o Vite repassa /api ao ergo, em
// produção o proxy com rate limit faz isso (plano §6).
createApp(App)
  .use(createErgoDesign({ engine: createHttpEngine('/api') }))
  .mount('#app')
