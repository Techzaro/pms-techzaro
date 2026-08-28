import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      'firebase/app': path.resolve(__dirname, 'node_modules/firebase/app/dist/esm/index.esm.js'),
      'firebase/messaging': path.resolve(__dirname, 'node_modules/firebase/messaging/dist/esm/index.esm.js'),
    },
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/sanctum': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: [
      'jspdf',
      'jspdf-autotable',
      'dayjs',
      'dayjs/plugin/utc',
      'dayjs/plugin/timezone',
      'dayjs/plugin/customParseFormat',
      'dayjs/plugin/relativeTime',
      'dayjs/locale/en',
      'dayjs/locale/es',
      'dayjs/locale/fr',
      'dayjs/locale/de',
      'dayjs/locale/ar',
      'dayjs/locale/ur',
      'dayjs/locale/hi',
      'dayjs/locale/zh-cn',
      'dayjs/locale/ja',
      'i18next',
      'react-i18next',
    ],
  },
})