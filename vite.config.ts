import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      base: '/taskwise/',
      scope: '/taskwise/',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'TaskWise – National Youth Services Council',
        short_name: 'TaskWise',
        description: 'Hierarchical Task Management for National Youth Services Council',
        theme_color: '#1f2d3d',
        background_color: '#1f2d3d',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/taskwise/',
        start_url: '/taskwise/',
        icons: [
          { src: '/taskwise/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/taskwise/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 3500,
    proxy: {
      '/api': {
        target: 'http://localhost:4300',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  base: process.env.NODE_ENV === 'production' ? '/taskwise/' : '/',
})
