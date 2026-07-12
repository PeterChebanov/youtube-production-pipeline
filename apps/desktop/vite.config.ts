import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: { port: 5173, strictPort: true, open: false, host: 'localhost' },
  build: { outDir: 'dist', emptyOutDir: true },
});
