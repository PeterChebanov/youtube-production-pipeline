import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.electron.json'], {
  cwd: root,
  stdio: 'inherit',
});

copyFileSync(
  path.join(root, 'electron/preload.cjs'),
  path.join(root, 'dist-electron/preload.cjs'),
);

console.log('[ecpe] Electron compiled');
