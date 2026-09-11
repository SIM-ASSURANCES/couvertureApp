import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Carte interactive (Next.js, frontend/carte) : lancer `npm --prefix carte run dev` (port 3001).
      '/carte': { target: 'http://localhost:3001', ws: true },
    },
  },
})
