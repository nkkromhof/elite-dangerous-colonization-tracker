import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ configFile: '../../svelte.config.js' })],
  root: 'src/frontend',
  build: {
    outDir: '../../public/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api/events': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 0,
        headers: { 'Cache-Control': 'no-cache' },
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
