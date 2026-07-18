import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ecpe', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: unknown) => ipcRenderer.invoke('settings:save', patch),
  createProject: (input: unknown) => ipcRenderer.invoke('project:create', input),
  createCourse: (input: unknown) => ipcRenderer.invoke('course:create', input),
  loadCourse: (root: string) => ipcRenderer.invoke('course:load', root),
  getCourseInfo: (root: string) => ipcRenderer.invoke('course:info', root),
  createEpisode: (input: unknown) => ipcRenderer.invoke('course:createEpisode', input),
  getApplicationState: (root: string) => ipcRenderer.invoke('course:getApplicationState', root),
  saveApplicationState: (root: string, content: string) =>
    ipcRenderer.invoke('course:saveApplicationState', root, content),
  getPriorCoverage: (root: string) => ipcRenderer.invoke('course:getPriorCoverage', root),
  savePriorCoverage: (root: string, content: string) =>
    ipcRenderer.invoke('course:savePriorCoverage', root, content),
  updateCourseAppRepo: (input: {
    courseRoot: string;
    appRepoPath: string;
    appRepoUrl?: string;
  }) => ipcRenderer.invoke('course:updateAppRepo', input),
  getEpisodeAuthoring: (projectRoot: string) =>
    ipcRenderer.invoke('episode:getAuthoring', projectRoot),
  saveEpisodeAuthoring: (
    projectRoot: string,
    input: { demoWalkthroughMd?: string; researchFocus?: string; reviewFocus?: string },
  ) => ipcRenderer.invoke('episode:saveAuthoring', projectRoot, input),
  regenerateEpisodeCode: (projectRoot: string) =>
    ipcRenderer.invoke('episode:regenerateCode', projectRoot),
  generateEpisodeCode: (input: {
    demoMarkdown: string;
    episodeNumber: number;
    repoUrl?: string;
    courseRoot?: string;
    appRepoPath?: string;
  }) => ipcRenderer.invoke('episode:generateCode', input),
  getProjectInfo: (root: string) => ipcRenderer.invoke('project:info', root),
  pickDirectory: (startPath?: string) => ipcRenderer.invoke('project:pickDirectory', startPath),
  pickTextFile: () => ipcRenderer.invoke('project:pickTextFile'),
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
  previewMotionPlan: (root: string, motionRatio: number) =>
    ipcRenderer.invoke('motion:preview', root, motionRatio),
  exportManifestCsv: (root: string) => ipcRenderer.invoke('manifest:exportCsv', root),
  exportMontageGuide: (root: string) => ipcRenderer.invoke('manifest:exportMontageGuide', root),
  llmStatus: () => ipcRenderer.invoke('llm:status'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onProgress: (cb: (payload: { stage: string; message: string }) => void) => {
    const listener = (_: unknown, payload: { stage: string; message: string }) => cb(payload);
    ipcRenderer.on('events:progress', listener);
    return () => ipcRenderer.removeListener('events:progress', listener);
  },
});
