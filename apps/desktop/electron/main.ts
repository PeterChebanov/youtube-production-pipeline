import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  createProjectAction,
  createCourseAction,
  loadCourseAction,
  getCourseInfoAction,
  createEpisodeAction,
  getApplicationStateAction,
  saveApplicationStateAction,
  getPriorCoverageAction,
  savePriorCoverageAction,
  exportManifestCsvAction,
  exportMontageGuideAction,
  getArtifactAction,
  getProjectInfoAction,
  llmStatusAction,
  loadSettings,
  previewMotionPlanAction,
  readChannelVideoYaml,
  runPipelineAction,
  saveArtifactAction,
  saveChannelVideoAction,
  updateSettingsAction,
} from './handlers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
}

function sendProgress(payload: { stage: string; message: string }) {
  mainWindow?.webContents.send('events:progress', payload);
}

function releaseDevPort(): void {
  if (!process.env.ELECTRON_RENDERER_URL) return;
  try {
    execSync('lsof -ti :5173 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
  } catch {
    // ignore — port may already be free
  }
}

function quitApplication(): void {
  releaseDevPort();
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    show: false,
    title: 'ECPE',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const pageUrl = process.env.ELECTRON_RENDERER_URL;
  if (pageUrl) {
    mainWindow.loadURL(pageUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  quitApplication();
});

app.on('before-quit', () => {
  releaseDevPort();
});

ipcMain.handle('app:quit', async () => {
  quitApplication();
  return { ok: true };
});

ipcMain.handle('settings:get', async () => loadSettings());
ipcMain.handle('settings:save', async (_e, patch) => updateSettingsAction(patch));

ipcMain.handle('project:create', async (_e, input) => createProjectAction(input));
ipcMain.handle('course:create', async (_e, input) => createCourseAction(input));
ipcMain.handle('course:load', async (_e, root: string) => loadCourseAction(root));
ipcMain.handle('course:info', async (_e, root: string) => getCourseInfoAction(root));
ipcMain.handle('course:createEpisode', async (_e, input) => createEpisodeAction(input));
ipcMain.handle('course:getApplicationState', async (_e, root: string) =>
  getApplicationStateAction(root),
);
ipcMain.handle('course:saveApplicationState', async (_e, root: string, content: string) =>
  saveApplicationStateAction(root, content),
);
ipcMain.handle('course:getPriorCoverage', async (_e, root: string) => getPriorCoverageAction(root));
ipcMain.handle('course:savePriorCoverage', async (_e, root: string, content: string) =>
  savePriorCoverageAction(root, content),
);
ipcMain.handle('project:info', async (_e, root: string) => getProjectInfoAction(root));

ipcMain.handle('project:pickDirectory', async (_e, startPath?: string) => {
  const options: OpenDialogOptions = {
    title: 'Choose folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: startPath || path.join(homedir(), 'Desktop'),
  };
  const win = focusedWindow();
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('project:openFolder', async (_e, filePath: string) => {
  await shell.openPath(filePath);
});

ipcMain.handle('project:pickTextFile', async () => {
  const options: OpenDialogOptions = {
    title: 'Import document',
    properties: ['openFile'],
    filters: [
      { name: 'Text', extensions: ['md', 'txt', 'markdown'] },
      { name: 'All files', extensions: ['*'] },
    ],
  };
  const win = focusedWindow();
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = await readFile(filePath, 'utf8');
  return { path: filePath, content };
});

ipcMain.handle('stage:getArtifact', async (_e, root: string, filename: string) =>
  getArtifactAction(root, filename),
);
ipcMain.handle('stage:saveArtifact', async (_e, root: string, filename: string, content: string) =>
  saveArtifactAction(root, filename, content),
);
ipcMain.handle('channelVideo:get', async (_e, root: string) => readChannelVideoYaml(root));
ipcMain.handle(
  'channelVideo:save',
  async (_e, root: string, channelYaml: string, videoYaml: string) =>
    saveChannelVideoAction(root, channelYaml, videoYaml),
);

ipcMain.handle('pipeline:run', async (_e, stageId: string, options) =>
  runPipelineAction(stageId, options, sendProgress),
);
ipcMain.handle('motion:preview', async (_e, root: string, motionRatio: number) =>
  previewMotionPlanAction(root, motionRatio),
);

ipcMain.handle('manifest:exportCsv', async (_e, root: string) => exportManifestCsvAction(root));
ipcMain.handle('manifest:exportMontageGuide', async (_e, root: string) =>
  exportMontageGuideAction(root),
);
ipcMain.handle('llm:status', async () => llmStatusAction());
