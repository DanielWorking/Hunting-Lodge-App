import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Heavy Rich-Text Editor Suite (isolated from initial entry)
            if (id.includes('@tiptap') || id.includes('prosemirror') || id.includes('orderedmap') || id.includes('w3c-keyname')) {
              return 'vendor-tiptap';
            }
            // HTTP Networking Client
            if (id.includes('axios')) {
              return 'vendor-axios';
            }
            // Date formatting utility
            if (id.includes('date-fns')) {
              return 'vendor-date-fns';
            }
            // Material UI & UI Components
            if (id.includes('@mui') || id.includes('@popperjs') || id.includes('clsx')) {
              return 'vendor-mui';
            }
            // React runtime core, DOM, Router, and Emotion CSS-in-JS engine
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('react-router') ||
              id.includes('react-router-dom') ||
              id.includes('@emotion') ||
              id.includes('scheduler') ||
              id.includes('@remix-run')
            ) {
              return 'vendor-react';
            }
          }
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      }
    }
  },
  preview: {
    port: 4173,
    host: true,
  }
})