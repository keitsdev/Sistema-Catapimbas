import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// A API usa a porta 3001 por padrão; sobrescreva com API_PROXY_TARGET quando necessário.
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
})
