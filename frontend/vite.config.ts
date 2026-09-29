import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Flask API runs on :5000 during development; Vite proxies /api to it so the
// frontend can use relative URLs in every environment.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
    },
  },
});
