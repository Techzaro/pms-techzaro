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
  optimizeDeps: {
    include: ['jspdf', 'jspdf-autotable'],
  },
})