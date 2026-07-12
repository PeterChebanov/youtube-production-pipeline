import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { electronBinary } from './electron-binary.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
const mainJs = path.join(appRoot, 'dist-electron/main.js');
const devUrl = 'http://localhost:5173';

async function waitForFile(filePath, label, maxMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (existsSync(filePath)) return;
    await sleep(200);
  }
  throw new Error(`[ecpe] Timed out waiting for ${label}: ${filePath}`);
}

async function waitForVite(maxMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const response = await fetch(devUrl);
      if (response.ok) return;
    } catch {
      // vite still starting
    }
    await sleep(300);
  }
  throw new Error(`[ecpe] Timed out waiting for Vite at ${devUrl}`);
}

async function main() {
  console.log('[ecpe] Waiting for Electron build…');
  await waitForFile(mainJs, 'dist-electron/main.js');

  console.log('[ecpe] Waiting for Vite dev server…');
  await waitForVite();

  console.log('[ecpe] Launching desktop window…');
  const child = spawn(electronBinary, ['.'], {
    cwd: appRoot,
    env: { ...process.env, VITE_DEV_SERVER_URL: devUrl },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
