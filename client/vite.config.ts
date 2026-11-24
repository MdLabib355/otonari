import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Makes the app installable. Only `npm run build` creates the service worker: `npm run dev` has none.
// It keeps just the built app files. It has no rule for /api and /uploads, so those always come from
// the network.
const pwa = VitePWA({
  registerType: 'autoUpdate',
  injectRegister: null, // src/app/serviceWorker.ts does that
  manifest: {
    name: 'Otonari',
    short_name: 'Otonari',
    start_url: '/',
    display: 'standalone',
    theme_color: '#264d73', // --accent in src/styles/base.css
    background_color: '#faf8f3', // --bg in src/styles/base.css
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // Pages come from the server too, so that the app always starts in its newest version. The kept page
    // is only used when there is no connection.
    navigateFallback: null,
    directoryIndex: null,
    runtimeCaching: [
      {
        urlPattern: ({ request, url }) => request.mode === 'navigate' && !/^\/(api|uploads)\//.test(url.pathname),
        handler: 'NetworkOnly',
        options: { precacheFallback: { fallbackURL: 'index.html' } },
      },
    ],
  },
});

// In development, Vite serves the React app on :5173 and forwards API calls and photos to the
// Express server on :3001. So the client always uses relative URLs like "/api/v1/shelf", and the
// same code works in production, where Express serves everything from a single port.
export default defineConfig({
  plugins: [react(), pwa],
  server: {
    port: 5173,
    strictPort: true, // if 5173 is busy, stop with an error instead of quietly picking another port
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
});
