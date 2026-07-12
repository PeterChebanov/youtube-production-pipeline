import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.resolve(rootDir, 'electron/main.ts'),
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: path.resolve(rootDir, 'electron/preload.ts'),
      },
    },
  },
  renderer: {
    root: rootDir,
    plugins: [svelte()],
    server: {
      port: 5173,
      strictPort: true,
      host: 'localhost',
    },
    build: {
      rollupOptions: {
        input: path.resolve(rootDir, 'index.html'),
      },
    },
  },
});
