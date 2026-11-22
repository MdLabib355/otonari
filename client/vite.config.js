import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, Vite serves the React app on :5173 and forwards API calls and photos to the
// Express server on :3001. So the client always uses relative URLs like "/api/shelf", and the
// same code works in production, where Express serves everything from a single port.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // if 5173 is busy, stop with an error instead of quietly picking another port
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
});
