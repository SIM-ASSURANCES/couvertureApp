import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Bibliothèques stables séparées du code applicatif (audit performance
        // 2026-10-12) : un redéploiement ne change que le bloc applicatif, le
        // navigateur garde React/routeur/icônes en cache (nom hashé, cache 1 an).
        // `xlsx` reste hors de ces groupes : chargé à la demande (import dynamique).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react";
          if (/node_modules\/(react-router|react-router-dom|@remix-run)\//.test(id)) return "vendor-router";
          if (/node_modules\/lucide-react\//.test(id)) return "vendor-icones";
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      // Carte interactive (Next.js, frontend/carte) : lancer `npm --prefix carte run dev` (port 3001).
      '/carte': { target: 'http://localhost:3001', ws: true },
    },
  },
})
