export interface EcpeApi {
  getSettings: () => Promise<{ defaultProjectsRoot: string; recentProjects: string[] }>;
  saveSettings: (patch: Partial<{ defaultProjectsRoot: string }>) => Promise<unknown>;
  createProject: (input: {
    name: string;
    parentDir?: string;
    topic?: string;
  }) => Promise<{ root: string }>;
  getProjectInfo: (root: string) => Promise<unknown>;
  pickDirectory: () => Promise<string | null>;
  openFolder: (p: string) => Promise<void>;
  getArtifact: (root: string, filename: string) => Promise<string>;
  saveArtifact: (root: string, filename: string, content: string) => Promise<unknown>;
  getChannelVideo: (root: string) => Promise<{ channelYaml: string; videoYaml: string }>;
  saveChannelVideo: (root: string, channelYaml: string, videoYaml: string) => Promise<unknown>;
  runPipeline: (
    stageId: string,
    options: {
      projectPath: string;
      provider?: string;
      revisionNotes?: string;
      sceneId?: string;
    },
  ) => Promise<{ ok: boolean; stages: string[] }>;
  exportManifestCsv: (root: string) => Promise<{ path: string }>;
  llmStatus: () => Promise<Record<string, string>>;
  onProgress: (cb: (payload: { stage: string; message: string }) => void) => () => void;
}

declare global {
  interface Window {
    ecpe: EcpeApi;
  }
}

export {};
