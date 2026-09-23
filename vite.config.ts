import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Aplicação ergo.onled.cloud. Consome o pacote pelo mesmo nome que o admin do
// Covalente usa, então o site nunca alcança nada que não seja API pública.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@onled/ergo-design': fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
    },
  },
  server: {
    // O navegador só fala com a própria origem; o ergo não tem CORS nem deve ter.
    proxy: {
      '/api': {
        target: process.env.VITE_ERGO_ENGINE_URL ?? 'http://127.0.0.1:8099',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist-app',
  },
})
