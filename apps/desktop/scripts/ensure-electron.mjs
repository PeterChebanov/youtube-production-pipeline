import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function exists(p) {
  try {
    accessSync(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

let electronDir;
try {
  electronDir = path.dirname(require.resolve('electron', { paths: [repoRoot] }));
} catch {
  console.error('[ecpe] electron package not found — run pnpm install from repo root');
  process.exit(1);
}

const macApp = path.join(electronDir, 'dist', 'Electron.app');
const linuxBin = path.join(electronDir, 'dist', 'electron');
const winBin = path.join(electronDir, 'dist', 'electron.exe');
const installed = exists(macApp) || exists(linuxBin) || exists(winBin);

if (!installed) {
  console.log('[ecpe] Electron binary missing — downloading…');
  const result = spawnSync(process.execPath, [path.join(electronDir, 'install.js')], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
