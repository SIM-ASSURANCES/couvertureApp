import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Build séparé pour l'app mobile (Capacitor) : n'embarque que mobile.html
// (routes publiques + espace client, voir AppMobile.tsx), pas le site web
// complet. `base: './'` est nécessaire car ce build est servi localement
// dans le WebView Android (pas depuis la racine d'un domaine).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-mobile',
    rollupOptions: {
      input: fileURLToPath(new URL('./mobile.html', import.meta.url)),
    },
  },
})
