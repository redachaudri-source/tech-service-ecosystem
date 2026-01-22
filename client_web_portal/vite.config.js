import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    target: 'es2020', // Support BigInt for Mapbox GL
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2020'
    }
  },
})
