export interface CourseEpisodeSummary {
  episode: number;
  slug: string;
  title: string;
  folder: string;
  root: string;
  hasEpisodeCode: boolean;
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
    builds_application?: boolean;
    app_repo_path?: string;
    app_repo_url?: string;
    default_narrative_balance?: 'theory-first' | 'balanced' | 'practice-first';
  };
  appRepo?: {
    configuredPath: string;
    accessible: boolean;
    message?: string;
  };
  state: {
    episodes: { episode: number; title: string; folder: string }[];
  };
  episodes: CourseEpisodeSummary[];
  hasApplicationState: boolean;
  hasPriorCoverage: boolean;
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
    name: string;
    parentDir?: string;
    description?: string;
    builds_application?: boolean;
    app_repo_path?: string;
    app_repo_url?: string;
  }) => Promise<{ courseRoot: string }>;
  loadCourse: (root: string) => Promise<CourseInfo>;
  getCourseInfo: (root: string) => Promise<CourseInfo>;
  createEpisode: (input: {
    courseRoot: string;
    title: string;
    topic?: string;
    sourceBrief?: string;
    episodeCode?: string;
    demoWalkthroughMd?: string;
    researchFocus?: string;
    reviewFocus?: string;
    narrativeBalance?: 'theory-first' | 'balanced' | 'practice-first';
  }) => Promise<{ root: string }>;
  getApplicationState: (root: string) => Promise<{ content: string }>;
  saveApplicationState: (root: string, content: string) => Promise<{ ok: boolean }>;
  getPriorCoverage: (root: string) => Promise<{ content: string }>;
  savePriorCoverage: (root: string, content: string) => Promise<{ ok: boolean }>;
  updateCourseAppRepo: (input: {
    courseRoot: string;
    appRepoPath: string;
    appRepoUrl?: string;
  }) => Promise<CourseInfo>;
  getEpisodeAuthoring: (projectRoot: string) => Promise<{
    demo_walkthrough_md: string;
    research_focus: string;
    review_focus: string;
  }>;
  saveEpisodeAuthoring: (
    projectRoot: string,
    input: { demoWalkthroughMd?: string; researchFocus?: string; reviewFocus?: string },
  ) => Promise<{
    ok: boolean;
    episodeCode?: { git_checkpoint: string; cumulative_scope: string[] };
    episodeCodeError?: string;
  }>;
  regenerateEpisodeCode: (projectRoot: string) => Promise<{
    json: string;
    git_checkpoint: string;
    cumulative_scope: string[];
  }>;
  generateEpisodeCode: (input: {
    demoMarkdown: string;
    episodeNumber: number;
    repoUrl?: string;
    courseRoot?: string;
    appRepoPath?: string;
  }) => Promise<{ json: string }>;
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
