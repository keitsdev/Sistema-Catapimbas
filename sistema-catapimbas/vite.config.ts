import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Em produção, aponte /api para o backend Node (proxy ou variável VITE_API_URL).
export default defineConfig({ plugins: [react()], server: { proxy: { '/api': 'http://localhost:3333' } } })
