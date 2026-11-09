import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        // Override with API_PROXY_TARGET when port 8000 is unavailable locally.
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // Browser E2E specs in e2e/ run with Playwright, not Vitest.
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    testTimeout: 15000,
  },
})

