import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Custom injectManifest service worker supports PWA precaching, auto-update, AND Web Push alerts.
const pwa = VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.js',
  registerType: 'autoUpdate',
  injectRegister: null, // registered by src/serviceWorker.js
  manifest: {
    name: 'Otonari',
    short_name: 'Otonari',
    start_url: '/',
    display: 'standalone',
    theme_color: '#1f4b6e',
    background_color: '#f6f2ea',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
  },
});

export default defineConfig({
  plugins: [react(), pwa],
  build: {
    // Emit universal @media (min-width: ...) syntax instead of CSS Level 4 range queries.
    cssTarget: 'chrome90',
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
});
