#!/bin/sh
set -e

# Free dev port
lsof -ti :5173 | xargs kill -9 2>/dev/null || true

# Kill stale desktop dev processes (including suspended jobs after Ctrl+Z)
for pattern in \
  "video-production-pipeline/apps/desktop.*concurrently" \
  "video-production-pipeline/apps/desktop.*wait-on" \
  "video-production-pipeline/apps/desktop.*start-electron" \
  "video-production-pipeline/apps/desktop.*electron-vite" \
  "video-production-pipeline/apps/desktop.*vite" \
  "video-production-pipeline/apps/desktop/out/main" \
  "video-production-pipeline/apps/desktop.*Electron"
do
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    kill -9 $pids 2>/dev/null || true
  fi
done

# Orphan Electron windows from this repo (survive vite restarts; keep stale IPC handlers)
for pattern in \
  "Electron.*video-production-pipeline" \
  "Electron Helper.*video-production-pipeline"
do
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    kill -9 $pids 2>/dev/null || true
  fi
done

echo "[ecpe] Dev processes stopped."
echo "[ecpe] If the terminal still shows a suspended job, run: kill %1"
echo "[ecpe] Cursor sets ELECTRON_RUN_AS_NODE=1 — dev script clears it automatically."
