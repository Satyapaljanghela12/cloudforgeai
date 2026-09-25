import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite configuration for CloudForge AI frontend.
 *
 * Tailwind is loaded as a Vite plugin (the modern approach as of Tailwind v4)
 * rather than as a PostCSS plugin. This is faster and requires no
 * tailwind.config.js file.
 *
 * The proxy routes /api/* requests to the backend during development,
 * so the frontend never needs to know the backend URL at runtime.
 * In production, a reverse proxy (Nginx) handles this instead.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
