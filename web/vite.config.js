import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    // Recharts is the single heaviest dependency; splitting it out keeps it in
    // a long-lived vendor chunk instead of invalidating on every app change.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'recharts', test: /node_modules[\\/](recharts|d3-|victory-|internmap|decimal\.js-light)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
