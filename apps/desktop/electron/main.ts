import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProjectAction,
  exportManifestCsvAction,
  getArtifactAction,
  getProjectInfoAction,
  llmStatusAction,
  loadSettings,
  readChannelVideoYaml,
  runPipelineAction,
  saveArtifactAction,
  saveChannelVideoAction,
  saveSettings,
  updateSettingsAction,
} from './handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function sendProgress(payload: { stage: string; message: string }) {
  mainWindow?.webContents.send('events:progress', payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('settings:get', async () => loadSettings());
ipcMain.handle('settings:save', async (_e, patch) => updateSettingsAction(patch));

ipcMain.handle('project:create', async (_e, input) => createProjectAction(input));
ipcMain.handle('project:info', async (_e, root: string) => getProjectInfoAction(root));
ipcMain.handle('project:pickDirectory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('project:openFolder', async (_e, filePath: string) => {
  await shell.openPath(filePath);
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

ipcMain.handle('manifest:exportCsv', async (_e, root: string) => exportManifestCsvAction(root));
ipcMain.handle('llm:status', async () => llmStatusAction());

ipcMain.handle('settings:saveRoot', async (_e, defaultProjectsRoot: string) => {
  const settings = await loadSettings();
  settings.defaultProjectsRoot = defaultProjectsRoot;
  await saveSettings(settings);
  return settings;
});
