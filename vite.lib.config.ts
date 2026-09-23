import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Pacote instalável. Vue fica de fora do bundle: quem instala já tem o seu, e
// duas cópias de Vue na mesma página quebram provide/inject.
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'style',
    },
    rolldownOptions: {
      // pdf.js também: é dependência do pacote, e o worker é resolvido pelo
      // Vite do host (`?url`), não embutido em base64 no bundle.
      external: ['vue', /^pdfjs-dist(\/|$)/],
    },
  },
})
