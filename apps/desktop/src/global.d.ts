export interface CourseEpisodeSummary {
  episode: number;
  slug: string;
  title: string;
  folder: string;
  root: string;
  status: 'planned' | 'in_progress' | 'done';
  artifactFlags: {
    finalScript: boolean;
    productionPlan: boolean;
    editManifest: boolean;
  };
}

export interface CourseInfo {
  paths: { root: string };
  course: {
    name: string;
    slug: string;
    type: 'build-along' | 'theory';
    description: string;
  };
  state: {
    episodes: { episode: number; title: string; folder: string }[];
  };
  episodes: CourseEpisodeSummary[];
  hasApplicationState: boolean;
  hasMasterPlan: boolean;
}

export interface AppSettings {
  defaultProjectsRoot: string;
  defaultCoursesRoot: string;
  defaultSinglesRoot: string;
  recentProjects: string[];
  recentCourses: string[];
}

export interface EcpeApi {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (
    patch: Partial<{
      defaultProjectsRoot: string;
      defaultCoursesRoot: string;
      defaultSinglesRoot: string;
    }>,
  ) => Promise<AppSettings>;
  createProject: (input: {
    name?: string;
    parentDir?: string;
    topic?: string;
    sourceBrief?: string;
  }) => Promise<{ root: string }>;
  createCourse: (input: {
    name?: string;
    parentDir?: string;
    topic?: string;
    sourceBrief?: string;
    description?: string;
    type?: 'build-along' | 'theory';
  }) => Promise<{ courseRoot: string; firstEpisodeRoot?: string }>;
  loadCourse: (root: string) => Promise<CourseInfo>;
  getCourseInfo: (root: string) => Promise<CourseInfo>;
  createEpisode: (input: {
    courseRoot: string;
    title: string;
    topic?: string;
    sourceBrief?: string;
  }) => Promise<{ root: string }>;
  getApplicationState: (root: string) => Promise<{ content: string }>;
  saveApplicationState: (root: string, content: string) => Promise<{ ok: boolean }>;
  getPriorCoverage: (root: string) => Promise<{ content: string }>;
  savePriorCoverage: (root: string, content: string) => Promise<{ ok: boolean }>;
  getProjectInfo: (root: string) => Promise<unknown>;
  pickDirectory: (startPath?: string) => Promise<string | null>;
  pickTextFile: () => Promise<{ path: string; content: string } | null>;
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
      motionRatio?: number;
    },
  ) => Promise<{ ok: boolean; stages: string[] }>;
  previewMotionPlan: (
    root: string,
    motionRatio: number,
  ) => Promise<{
    total_scenes: number;
    fixed_static: number;
    already_motion: number;
    animatable: number;
    target_motion_ratio: number;
    selected_animated: number;
    selected_static_animatable: number;
  } | null>;
  exportManifestCsv: (root: string) => Promise<{ path: string }>;
  exportMontageGuide: (root: string) => Promise<{ path: string }>;
  llmStatus: () => Promise<Record<string, string>>;
  quitApp: () => Promise<{ ok: boolean }>;
  onProgress: (cb: (payload: { stage: string; message: string }) => void) => () => void;
}

declare global {
  interface Window {
    ecpe: EcpeApi;
  }
}

export {};
