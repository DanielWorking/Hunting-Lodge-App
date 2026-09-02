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
            const normalizedId = id.replace(/\\/g, '/');

            // Heavy Rich-Text Editor Suite (isolated from initial entry)
            if (
              normalizedId.includes('@tiptap') ||
              normalizedId.includes('prosemirror') ||
              normalizedId.includes('orderedmap') ||
              normalizedId.includes('w3c-keyname')
            ) {
              return 'vendor-tiptap';
            }
            // Material UI Icons suite (isolated so icon usage does not block UI core)
            if (normalizedId.includes('@mui/icons-material')) {
              return 'vendor-mui-icons';
            }
            // Material UI Core component primitives & styling system
            if (
              normalizedId.includes('@mui/material') ||
              normalizedId.includes('@mui/system') ||
              normalizedId.includes('@mui/base') ||
              normalizedId.includes('@mui/utils') ||
              normalizedId.includes('@popperjs')
            ) {
              return 'vendor-mui-core';
            }
            // Emotion CSS-in-JS styling engine & class utilities
            if (
              normalizedId.includes('@emotion') ||
              normalizedId.includes('clsx')
            ) {
              return 'vendor-emotion';
            }
            // HTTP Networking Client
            if (normalizedId.includes('axios')) {
              return 'vendor-axios';
            }
            // Date formatting utility
            if (normalizedId.includes('date-fns')) {
              return 'vendor-date-fns';
            }
            // Core React runtime, DOM, and Router
            if (
              /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run)\//.test(normalizedId)
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