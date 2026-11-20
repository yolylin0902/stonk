import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 支援 GitHub Pages 與 Vercel 相對路徑
  server: {
    port: 3000,
    host: true
  }
})

