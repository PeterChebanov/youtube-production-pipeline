import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ecpe', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: unknown) => ipcRenderer.invoke('settings:save', patch),
  createProject: (input: unknown) => ipcRenderer.invoke('project:create', input),
  getProjectInfo: (root: string) => ipcRenderer.invoke('project:info', root),
  pickDirectory: () => ipcRenderer.invoke('project:pickDirectory'),
  openFolder: (p: string) => ipcRenderer.invoke('project:openFolder', p),
  getArtifact: (root: string, filename: string) =>
    ipcRenderer.invoke('stage:getArtifact', root, filename),
  saveArtifact: (root: string, filename: string, content: string) =>
    ipcRenderer.invoke('stage:saveArtifact', root, filename, content),
  getChannelVideo: (root: string) => ipcRenderer.invoke('channelVideo:get', root),
  saveChannelVideo: (root: string, channelYaml: string, videoYaml: string) =>
    ipcRenderer.invoke('channelVideo:save', root, channelYaml, videoYaml),
  runPipeline: (stageId: string, options: unknown) =>
    ipcRenderer.invoke('pipeline:run', stageId, options),
  exportManifestCsv: (root: string) => ipcRenderer.invoke('manifest:exportCsv', root),
  llmStatus: () => ipcRenderer.invoke('llm:status'),
  onProgress: (cb: (payload: { stage: string; message: string }) => void) => {
    const listener = (_: unknown, payload: { stage: string; message: string }) => cb(payload);
    ipcRenderer.on('events:progress', listener);
    return () => ipcRenderer.removeListener('events:progress', listener);
  },
});
