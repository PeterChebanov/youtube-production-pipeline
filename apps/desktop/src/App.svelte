<script lang="ts">
  import { marked } from 'marked';
  import { onMount } from 'svelte';
  import type { AppSettings, CourseInfo } from './global';

  type View = 'home' | 'create' | 'course' | 'project' | 'montage' | 'settings';
  type CreateMode = 'course' | 'single';
  type NarrativeBalance = 'theory-first' | 'balanced' | 'practice-first';

  let view: View = $state('home');
  let createMode: CreateMode = $state('single');
  let settings = $state<AppSettings | null>(null);
  let projectRoot = $state('');
  let projectInfo = $state<any>(null);
  let courseRoot = $state('');
  let courseInfo = $state<CourseInfo | null>(null);
  let applicationState = $state('');
  let applicationStateDirty = $state(false);
  let priorCoverage = $state('');
  let priorCoverageDirty = $state(false);
  let newEpisodeTitle = $state('');
  let newEpisodeTopic = $state('');
  let newEpisodeBrief = $state('');
  let newEpisodeDemoWalkthrough = $state('');
  let newEpisodeResearchFocus = $state('');
  let newEpisodeReviewFocus = $state('');
  let newEpisodeNarrativeBalance = $state<NarrativeBalance>('theory-first');
  let demoWalkthroughMd = $state('');
  let courseAppRepoPath = $state('');
  let researchFocusMd = $state('');
  let reviewFocusMd = $state('');
  let episodeCodeSummary = $state('');
  let authoringDirty = $state(false);
  let logs = $state<string[]>([]);
  let busy = $state(false);
  let revision = $state('');
  let errorMessage = $state('');
  let bridgeReady = $state(false);

  let newName = $state('');
  let newTopic = $state('');
  let newDescription = $state('');
  let newCourseKind = $state<'build-app' | 'theory'>('build-app');
  let newAppRepoPath = $state('');
  let newAppRepoUrl = $state('');
  let newSourceBrief = $state('');
  let courseAppRepoUrl = $state('');
  let courseAppRepoDirty = $state(false);
  let targetFolder = $state('');

  let channelYaml = $state('');
  let videoYaml = $state('');
  let narrativeBalance = $state<NarrativeBalance>('theory-first');
  let theoryBoost = $state('');
  let practiceBoost = $state('');
  let narrativeDirty = $state(false);
  let contextSaved = $state(true);
  let contextEditing = $state(false);
  let sourceBrief = $state('');
  let artifactName = $state('final-script.md');
  let artifactContent = $state('');

  let manifest = $state<any>(null);
  let blocks = $state<any>(null);
  let selectedBlockId = $state<string | null>(null);
  let selectedEntryIndex = $state<number | null>(null);

  let llmStatus = $state<Record<string, string>>({});
  let llmLoading = $state(false);

  let motionRatioPercent = $state(0);
  let motionPreview = $state<{
    fixed_static: number;
    already_motion: number;
    animatable: number;
    selected_animated: number;
    selected_static_animatable: number;
  } | null>(null);

  const MOTION_RATIO_STEPS = [0, 25, 50, 75, 100];

  const DEFAULT_COURSES_FOLDER = '~/Desktop/ECPE/courses';
  const DEFAULT_SINGLES_FOLDER = '~/Desktop/ECPE/singles';

  let canCreate = $derived.by(() => {
    if (createMode === 'course') {
      if (!newName.trim()) return false;
      if (newCourseKind === 'build-app' && !newAppRepoPath.trim()) return false;
      return true;
    }
    return Boolean(newSourceBrief.trim() || newName.trim());
  });

  let canCreateEpisode = $derived.by(() => {
    if (!newEpisodeTitle.trim()) return false;
    if (courseInfo?.course.builds_application && !newEpisodeDemoWalkthrough.trim()) return false;
    return true;
  });

  let breadcrumb = $derived.by(() => {
    const parts: string[] = [];
    if (courseInfo?.course?.name) parts.push(courseInfo.course.name);
    if (projectInfo?.video?.episode) parts.push(`Ep ${projectInfo.video.episode}`);
    else if (projectRoot && !courseRoot) parts.push('Single video');
    if (projectRoot && view === 'project') parts.push('Pipeline');
    if (projectRoot && view === 'montage') parts.push('Montage');
    return parts.join(' › ');
  });

  const pipelineStageKeys = [
    'research',
    'technicalReview',
    'script',
    'educationalReview',
    'finalScript',
    'narrationSegments',
    'productionPlan',
    'editManifest',
  ] as const;

  let pipelineStarted = $derived(
    !!projectInfo?.state?.last_completed_stage ||
      pipelineStageKeys.some((k) => !!projectInfo?.artifacts?.[k]),
  );

  let contextFieldsLocked = $derived(pipelineStarted || (contextSaved && !contextEditing));

  let canSaveContext = $derived(!pipelineStarted && (!contextSaved || contextEditing) && !busy);

  let canEditContext = $derived(!pipelineStarted && contextSaved && !contextEditing && !busy);

  const knowledgeStages = [
    'research',
    'technical-review',
    'script-writer',
    'educational-review',
    'youtube-editor',
    'segment',
  ];
  const productionStages = ['visual-plan', 'render-assets'];

  function parseMotionRatioFromYaml(yaml: string): number {
    const m = yaml.match(/^motion_ratio:\s*([0-9.]+)\s*$/m);
    if (!m) return 0;
    const v = Number(m[1]);
    if (!Number.isFinite(v)) return 0;
    return Math.min(100, Math.max(0, Math.round(v * 100)));
  }

  function motionRatioLabel(percent: number): string {
    if (percent === 0) return '100% static';
    if (percent === 100) return '100% motion';
    return `${percent}% motion / ${100 - percent}% static`;
  }

  async function refreshMotionPreview() {
    if (!projectRoot || !window.ecpe?.previewMotionPlan) {
      motionPreview = null;
      return;
    }
    if (!projectInfo?.artifacts?.productionPlan) {
      motionPreview = null;
      return;
    }
    try {
      const stats = await window.ecpe.previewMotionPlan(
        projectRoot,
        motionRatioPercent / 100,
      );
      motionPreview = stats;
    } catch {
      motionPreview = null;
    }
  }

  function onMotionRatioChange(percent: number) {
    motionRatioPercent = percent;
    void refreshMotionPreview();
  }

  function parseYamlScalar(yaml: string, key: string): string {
    const m = yaml.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    if (!m) return '';
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  }

  function setYamlScalar(yaml: string, key: string, value: string): string {
    const needsQuotes = /[:#]/.test(value) || value.includes(',');
    const formatted =
      value === '' ? '""' : needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
    const line = `${key}: ${formatted}`;
    if (new RegExp(`^${key}:`, 'm').test(yaml)) {
      return yaml.replace(new RegExp(`^${key}:.*$`, 'm'), line);
    }
    return `${yaml.trimEnd()}\n${line}\n`;
  }

  function loadNarrativeFromVideoYaml() {
    const balance = parseYamlScalar(videoYaml, 'narrative_balance') || 'theory-first';
    narrativeBalance = (
      ['theory-first', 'balanced', 'practice-first'].includes(balance)
        ? balance
        : 'theory-first'
    ) as NarrativeBalance;
    theoryBoost = parseYamlScalar(videoYaml, 'theory_boost');
    practiceBoost = parseYamlScalar(videoYaml, 'practice_boost');
    narrativeDirty = false;
  }

  function applyNarrativeToVideoYaml() {
    let next = videoYaml;
    next = setYamlScalar(next, 'narrative_balance', narrativeBalance);
    next = setYamlScalar(next, 'theory_boost', theoryBoost);
    next = setYamlScalar(next, 'practice_boost', practiceBoost);
    videoYaml = next;
  }

  function onNarrativeChange() {
    narrativeDirty = true;
  }

  function setError(msg: string) {
    errorMessage = msg;
    if (msg) log(`ERROR: ${msg}`);
  }

  function clearError() {
    errorMessage = '';
  }

  async function refreshSettings() {
    if (!window.ecpe) return;
    settings = await window.ecpe.getSettings();
    if (createMode === 'course') {
      targetFolder = settings.defaultCoursesRoot;
    } else {
      targetFolder = settings.defaultSinglesRoot;
    }
    llmLoading = true;
    try {
      llmStatus = await window.ecpe.llmStatus();
    } catch (err) {
      llmStatus = { error: err instanceof Error ? err.message : String(err) };
    } finally {
      llmLoading = false;
    }
  }

  function startCreate(mode: CreateMode) {
    createMode = mode;
    newName = '';
    newTopic = '';
    newDescription = '';
    newSourceBrief = '';
    newCourseKind = 'build-app';
    newAppRepoPath = '';
    newAppRepoUrl = '';
    if (settings) {
      targetFolder = mode === 'course' ? settings.defaultCoursesRoot : settings.defaultSinglesRoot;
    }
    view = 'create';
    clearError();
  }

  async function openCourse(root: string) {
    if (!window.ecpe) return;
    clearError();
    busy = true;
    try {
      courseRoot = root;
      courseInfo = await window.ecpe.loadCourse(root);
      courseAppRepoPath = courseInfo.course.app_repo_path ?? '';
      courseAppRepoUrl = courseInfo.course.app_repo_url ?? '';
      courseAppRepoDirty = false;
      syncNewEpisodeNarrativeDefault(courseInfo);
      const appState = await window.ecpe.getApplicationState(root);
      applicationState = appState.content;
      applicationStateDirty = false;
      const prior = await window.ecpe.getPriorCoverage(root);
      priorCoverage = prior.content;
      priorCoverageDirty = false;
      view = 'course';
      settings = await window.ecpe.getSettings();
      log(`Opened course: ${root}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      courseRoot = '';
      courseInfo = null;
    } finally {
      busy = false;
    }
  }

  function syncNewEpisodeNarrativeDefault(info: CourseInfo | null) {
    const fromCourse = info?.course.default_narrative_balance;
    if (fromCourse && ['theory-first', 'balanced', 'practice-first'].includes(fromCourse)) {
      newEpisodeNarrativeBalance = fromCourse;
      return;
    }
    // Build-app episodes default to practice-first unless course overrides
    newEpisodeNarrativeBalance = info?.course.builds_application ? 'practice-first' : 'theory-first';
  }

  async function refreshCourseInfo() {
    if (!courseRoot || !window.ecpe) return;
    courseInfo = await window.ecpe.getCourseInfo(courseRoot);
    courseAppRepoPath = courseInfo.course.app_repo_path ?? '';
    courseAppRepoUrl = courseInfo.course.app_repo_url ?? '';
    courseAppRepoDirty = false;
    syncNewEpisodeNarrativeDefault(courseInfo);
  }

  async function pickAppRepoFolder(forCreate: boolean) {
    if (!window.ecpe) return;
    clearError();
    try {
      const start = forCreate ? newAppRepoPath || undefined : courseAppRepoPath || undefined;
      const picked = await window.ecpe.pickDirectory(start);
      if (!picked) return;
      if (forCreate) {
        newAppRepoPath = picked;
      } else {
        courseAppRepoPath = picked;
        courseAppRepoDirty = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveCourseAppRepo() {
    if (!courseRoot || !window.ecpe || !courseAppRepoPath.trim()) return;
    busy = true;
    clearError();
    try {
      courseInfo = await window.ecpe.updateCourseAppRepo({
        courseRoot,
        appRepoPath: courseAppRepoPath.trim(),
        appRepoUrl: courseAppRepoUrl.trim() || undefined,
      });
      courseAppRepoPath = courseInfo.course.app_repo_path ?? '';
      courseAppRepoUrl = courseInfo.course.app_repo_url ?? '';
      courseAppRepoDirty = false;
      log('Updated application repository path for course');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function pickCourseFolder() {
    if (!window.ecpe) return;
    clearError();
    try {
      const start = settings?.defaultCoursesRoot;
      const picked = await window.ecpe.pickDirectory(start);
      if (!picked) return;
      await openCourse(picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function savePriorCoverage() {
    if (!courseRoot || !window.ecpe) return;
    busy = true;
    clearError();
    try {
      await window.ecpe.savePriorCoverage(courseRoot, priorCoverage);
      priorCoverageDirty = false;
      log('Saved prior-coverage.md');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function saveApplicationState() {
    if (!courseRoot || !window.ecpe) return;
    busy = true;
    clearError();
    try {
      await window.ecpe.saveApplicationState(courseRoot, applicationState);
      applicationStateDirty = false;
      log('Saved application-state.md');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function createEpisode() {
    if (!courseRoot || !window.ecpe || !newEpisodeTitle.trim()) return;
    busy = true;
    clearError();
    try {
      const { root } = await window.ecpe.createEpisode({
        courseRoot,
        title: newEpisodeTitle.trim(),
        topic: newEpisodeTopic.trim() || undefined,
        sourceBrief: newEpisodeBrief.trim() || undefined,
        demoWalkthroughMd: newEpisodeDemoWalkthrough.trim() || undefined,
        researchFocus: newEpisodeResearchFocus.trim() || undefined,
        reviewFocus: newEpisodeReviewFocus.trim() || undefined,
        narrativeBalance: newEpisodeNarrativeBalance,
      });
      newEpisodeTitle = '';
      newEpisodeTopic = '';
      newEpisodeBrief = '';
      newEpisodeDemoWalkthrough = '';
      newEpisodeResearchFocus = '';
      newEpisodeReviewFocus = '';
      syncNewEpisodeNarrativeDefault(courseInfo);
      await refreshCourseInfo();
      await openProject(root);
      log(`Created episode: ${root}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  function episodeStatusLabel(status: string): string {
    if (status === 'in_progress') return 'In progress';
    if (status === 'done') return 'Done';
    return 'Planned';
  }

  async function saveEpisodeAuthoring() {
    if (!projectRoot || !window.ecpe) return;
    busy = true;
    clearError();
    try {
      const result = await window.ecpe.saveEpisodeAuthoring(projectRoot, {
        demoWalkthroughMd: demoWalkthroughMd.trim(),
        researchFocus: researchFocusMd.trim(),
        reviewFocus: reviewFocusMd.trim(),
      });
      authoringDirty = false;
      if (result.episodeCode) {
        episodeCodeSummary =
          `episode-code.json updated · git: ${result.episodeCode.git_checkpoint} · ` +
          `${result.episodeCode.cumulative_scope.length} files in cumulative_scope`;
        log(episodeCodeSummary);
      } else if (result.episodeCodeError) {
        episodeCodeSummary = `Authoring saved; episode-code not updated: ${result.episodeCodeError}`;
        setError(result.episodeCodeError);
      } else {
        log('Saved episode-authoring.yaml');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function regenerateEpisodeCode() {
    if (!projectRoot || !window.ecpe) return;
    busy = true;
    clearError();
    try {
      const result = await window.ecpe.regenerateEpisodeCode(projectRoot);
      episodeCodeSummary =
        `episode-code.json regenerated · git: ${result.git_checkpoint} · ` +
        `${result.cumulative_scope.length} files in cumulative_scope`;
      log(episodeCodeSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function importDemoByEpisodes(target: 'create' | 'project') {
    if (!window.ecpe) return;
    clearError();
    try {
      const file = await window.ecpe.pickTextFile();
      if (!file) return;

      const epNum =
        target === 'project'
          ? Number(projectInfo?.video?.episode ?? 1)
          : (courseInfo?.episodes?.length ?? 0) + 1;

      const sectionMatch = file.content.match(
        new RegExp(`##\\s*EP0*${epNum}(?:\\s*[—–-]|\\s+)[\\s\\S]*?(?=\\n##\\s*EP\\d|$)`, 'i'),
      );
      const section = sectionMatch?.[0] ?? file.content;

      if (!sectionMatch) {
        log(
          `Warning: no ## EP${String(epNum).padStart(2, '0')} heading found — pasted full file. ` +
            `Prefer the matching ## EP section.`,
        );
      }

      if (target === 'project') {
        demoWalkthroughMd = section.trim();
        authoringDirty = true;
      } else {
        newEpisodeDemoWalkthrough = section.trim();
      }

      log(`Imported demo-by-episodes section for EP${String(epNum).padStart(2, '0')}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function importTextFile(target: 'new' | 'project' | 'demoWalkthrough' | 'createDemo' | 'episodeBrief') {
    if (!window.ecpe) return;
    clearError();
    try {
      const file = await window.ecpe.pickTextFile();
      if (!file) return;
      if (target === 'new') {
        newSourceBrief = file.content;
      } else if (target === 'episodeBrief') {
        newEpisodeBrief = file.content;
      } else if (target === 'demoWalkthrough') {
        demoWalkthroughMd = file.content;
        authoringDirty = true;
      } else if (target === 'createDemo') {
        await importDemoByEpisodes('create');
        return;
      } else {
        sourceBrief = file.content;
      }
      log(`Imported: ${file.path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadSourceBrief() {
    if (!projectRoot || !window.ecpe) return;
    try {
      sourceBrief = await window.ecpe.getArtifact(projectRoot, 'source-brief.md');
    } catch {
      sourceBrief = '';
    }
  }

  async function saveSourceBrief() {
    if (!projectRoot || !window.ecpe) return;
    busy = true;
    clearError();
    try {
      await window.ecpe.saveArtifact(projectRoot, 'source-brief.md', sourceBrief);
      projectInfo = await window.ecpe.getProjectInfo(projectRoot);
      log('Saved source-brief.md');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function pickTargetFolder(target: 'create' | 'settings-courses' | 'settings-singles') {
    if (!window.ecpe) return;
    clearError();
    try {
      let start: string | undefined;
      if (target === 'create') start = targetFolder;
      else if (target === 'settings-courses') start = settings?.defaultCoursesRoot;
      else start = settings?.defaultSinglesRoot;

      const picked = await window.ecpe.pickDirectory(start);
      if (!picked) return;

      if (target === 'create') {
        targetFolder = picked;
      } else if (settings) {
        if (target === 'settings-courses') {
          settings = { ...settings, defaultCoursesRoot: picked };
          await window.ecpe.saveSettings({ defaultCoursesRoot: picked });
          log(`Courses folder: ${picked}`);
        } else {
          settings = { ...settings, defaultSinglesRoot: picked };
          await window.ecpe.saveSettings({ defaultSinglesRoot: picked });
          log(`Singles folder: ${picked}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openProject(root: string) {
    if (!window.ecpe) return;
    clearError();
    busy = true;
    try {
      projectRoot = root;
      projectInfo = await window.ecpe.getProjectInfo(root);
      const y = await window.ecpe.getChannelVideo(root);
      channelYaml = y.channelYaml;
      videoYaml = y.videoYaml;
      motionRatioPercent = parseMotionRatioFromYaml(y.channelYaml);
      loadNarrativeFromVideoYaml();
      contextSaved = true;
      contextEditing = false;
      await loadSourceBrief();
      await loadArtifact(artifactName);
      await loadMontageData();
      await refreshMotionPreview();

      if (projectInfo?.video?.course_root) {
        courseRoot = projectInfo.video.course_root;
        try {
          courseInfo = await window.ecpe.getCourseInfo(courseRoot);
        } catch {
          courseInfo = null;
        }
      }

      if (courseInfo?.course.builds_application) {
        const authoring = await window.ecpe.getEpisodeAuthoring(root);
        demoWalkthroughMd = authoring.demo_walkthrough_md;
        researchFocusMd = authoring.research_focus;
        reviewFocusMd = authoring.review_focus;
        authoringDirty = false;
      }

      view = 'project';
      log(`Opened project: ${root}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      projectRoot = '';
    } finally {
      busy = false;
    }
  }

  async function loadArtifact(name: string) {
    if (!projectRoot || !window.ecpe) return;
    artifactName = name;
    try {
      artifactContent = await window.ecpe.getArtifact(projectRoot, name);
    } catch {
      artifactContent = '';
    }
  }

  async function loadMontageData() {
    if (!projectRoot || !window.ecpe) return;
    try {
      manifest = JSON.parse(await window.ecpe.getArtifact(projectRoot, 'edit-manifest.json'));
    } catch {
      manifest = null;
    }
    try {
      const raw = await window.ecpe.getArtifact(projectRoot, 'narration-segments.json');
      const parsed = JSON.parse(raw);
      blocks = parsed.version === 2 ? parsed : null;
    } catch {
      blocks = null;
    }
  }

  function log(line: string) {
    logs = [...logs.slice(-200), line];
  }

  async function run(stageId: string) {
    if (!projectRoot || !window.ecpe) return;
    busy = true;
    clearError();
    log(`Running: ${stageId}…`);
    try {
      if (narrativeDirty) {
        applyNarrativeToVideoYaml();
        await window.ecpe.saveChannelVideo(projectRoot, channelYaml, videoYaml);
        narrativeDirty = false;
        log('Auto-saved narrative_balance before pipeline run');
      }
      const result = await window.ecpe.runPipeline(stageId, {
        projectPath: projectRoot,
        revisionNotes: revision || undefined,
        motionRatio:
          stageId === 'render-assets' || stageId === 'production'
            ? motionRatioPercent / 100
            : undefined,
      });
      log(`Done: ${result.stages.join(', ')}`);
      if (stageId === 'render-assets' || stageId === 'production') {
        log(`Motion mix: ${motionRatioLabel(motionRatioPercent)}`);
      }
      projectInfo = await window.ecpe.getProjectInfo(projectRoot);
      contextSaved = true;
      contextEditing = false;
      if ((stageId === 'youtube-editor' || stageId === 'knowledge') && courseRoot) {
        const appState = await window.ecpe.getApplicationState(courseRoot);
        applicationState = appState.content;
        applicationStateDirty = false;
        log(`Course application state synced (auto episode-wrap if script changed)`);
      }
      if (stageId === 'episode-wrap' && courseRoot) {
        const appState = await window.ecpe.getApplicationState(courseRoot);
        applicationState = appState.content;
        applicationStateDirty = false;
        log(`Course application state updated`);
      }
      await loadArtifact(artifactName);
      await loadMontageData();
      await refreshMotionPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function createProject() {
    if (!window.ecpe) {
      setError(
        'Desktop app not connected. Close this browser tab and use the ECPE window from pnpm dev:desktop.',
      );
      return;
    }
    if (createMode === 'course' && !newName.trim()) {
      setError('Enter a course name.');
      return;
    }
    if (createMode === 'single' && !newSourceBrief.trim() && !newName.trim()) {
      setError('Paste a creator roadmap or enter a project label.');
      return;
    }
    busy = true;
    clearError();
    log(createMode === 'course' ? 'Creating course…' : 'Creating single video…');
    try {
      if (createMode === 'course') {
        const buildsApp = newCourseKind === 'build-app';
        const { courseRoot: created } = await window.ecpe.createCourse({
          name: newName.trim(),
          parentDir: targetFolder || undefined,
          description: newDescription.trim() || undefined,
          builds_application: buildsApp,
          app_repo_path: buildsApp ? newAppRepoPath.trim() : undefined,
          app_repo_url: buildsApp ? newAppRepoUrl.trim() || undefined : undefined,
        });
        await openCourse(created);
      } else {
        const { root } = await window.ecpe.createProject({
          name: newName.trim() || undefined,
          topic: newTopic.trim() || undefined,
          parentDir: targetFolder || undefined,
          sourceBrief: newSourceBrief.trim() || undefined,
        });
        courseRoot = '';
        courseInfo = null;
        await openProject(root);
      }
      settings = await window.ecpe.getSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function saveNarrativeSettings() {
    if (!projectRoot || !window.ecpe) return;
    busy = true;
    clearError();
    try {
      applyNarrativeToVideoYaml();
      await window.ecpe.saveChannelVideo(projectRoot, channelYaml, videoYaml);
      projectInfo = await window.ecpe.getProjectInfo(projectRoot);
      narrativeDirty = false;
      log('Saved narrative balance settings');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function saveChannelVideo() {
    if (!projectRoot || !window.ecpe || !canSaveContext) return;
    busy = true;
    clearError();
    try {
      if (narrativeDirty) applyNarrativeToVideoYaml();
      await window.ecpe.saveChannelVideo(projectRoot, channelYaml, videoYaml);
      projectInfo = await window.ecpe.getProjectInfo(projectRoot);
      contextSaved = true;
      contextEditing = false;
      narrativeDirty = false;
      log('Context saved (channel.yaml + video.yaml)');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  function startContextEdit() {
    if (!canEditContext) return;
    contextEditing = true;
  }

  async function exportCsv() {
    if (!projectRoot || !window.ecpe) return;
    const { path: out } = await window.ecpe.exportManifestCsv(projectRoot);
    log(`Exported: ${out}`);
  }

  async function exportMontageGuide() {
    if (!projectRoot || !window.ecpe) return;
    const { path: out } = await window.ecpe.exportMontageGuide(projectRoot);
    log(`Exported: ${out}`);
  }

  function selectManifestRow(row: { block_id?: string; scene_order?: number }, index: number) {
    selectedEntryIndex = index;
    if (row.block_id) selectedBlockId = row.block_id;
  }

  let selectedEntry = $derived(
    selectedEntryIndex !== null && manifest?.entries
      ? manifest.entries[selectedEntryIndex]
      : null,
  );

  let selectedBlock = $derived(
    selectedBlockId && blocks?.blocks
      ? blocks.blocks.find((b: { block_id: string }) => b.block_id === selectedBlockId)
      : null,
  );

  let uncoveredSentences = $derived.by(() => {
    if (!blocks?.blocks || !manifest?.entries) return [];
    const uncovered: { block_id: string; index: number; text: string }[] = [];
    for (const block of blocks.blocks) {
      for (const s of block.sentences) {
        const covered = manifest.entries.some(
          (e: { block_id: string; status: string; sentence_start: number; sentence_end: number }) =>
            e.block_id === block.block_id &&
            e.status === 'ok' &&
            e.sentence_start <= s.index &&
            e.sentence_end >= s.index,
        );
        if (!covered) uncovered.push({ block_id: block.block_id, index: s.index, text: s.text });
      }
    }
    return uncovered;
  });

  let isCourseEpisode = $derived(projectInfo?.video?.kind === 'episode' && !!courseRoot);

  function stageDone(id: string): boolean {
    if (id === 'episode-wrap') {
      return projectInfo?.state?.last_completed_stage === 'episode-wrap';
    }
    const map: Record<string, string> = {
      research: 'research',
      'technical-review': 'technicalReview',
      'script-writer': 'script',
      'educational-review': 'educationalReview',
      'youtube-editor': 'finalScript',
      segment: 'narrationSegments',
      'visual-plan': 'productionPlan',
      'render-assets': 'editManifest',
    };
    const key = map[id];
    return key ? !!projectInfo?.artifacts?.[key] : false;
  }

  function exitApp() {
    window.ecpe?.quitApp();
  }

  onMount(() => {
    bridgeReady = !!window.ecpe;
    if (!bridgeReady) {
      targetFolder = DEFAULT_SINGLES_FOLDER;
      const inElectron = navigator.userAgent.includes('Electron');
      setError(
        inElectron
          ? 'Desktop bridge failed to load. Restart: pnpm dev:stop && pnpm dev:desktop'
          : 'This URL is the dev preview only. Close this browser tab. In Terminal run: pnpm dev:desktop — the ECPE desktop window will open.',
      );
      return;
    }
    refreshSettings();
    const off = window.ecpe.onProgress((p) => log(`${p.stage}: ${p.message}`));
    return off;
  });
</script>

<div class="layout">
  <aside class="sidebar">
    <h1>ECPE</h1>
    <div class="nav">
      <button class:active={view === 'home'} onclick={() => (view = 'home')}>Home</button>
      <button
        class:active={view === 'course'}
        onclick={() => courseRoot && (view = 'course')}
        disabled={!courseRoot}>Course</button
      >
      <button class:active={view === 'project'} onclick={() => projectRoot && (view = 'project')} disabled={!projectRoot}
        >Pipeline</button
      >
      <button class:active={view === 'montage'} onclick={() => projectRoot && (view = 'montage')} disabled={!projectRoot}
        >Montage</button
      >
      <button class:active={view === 'settings'} onclick={() => (view = 'settings')}>Settings</button>
    </div>
    {#if breadcrumb}
      <p class="muted breadcrumb">{breadcrumb}</p>
    {/if}
    {#if courseRoot}
      <p class="muted path-label">{courseRoot}</p>
    {:else if projectRoot}
      <p class="muted path-label">{projectRoot}</p>
    {/if}
    <div class="sidebar-footer">
      <button class="exit" type="button" onclick={exitApp} disabled={!bridgeReady}>Exit</button>
    </div>
  </aside>

  <main class="content">
    {#if errorMessage}
      <div class="error-banner">{errorMessage}</div>
    {/if}

    {#if !bridgeReady}
      <div class="card browser-blocker">
        <h2>Desktop app required</h2>
        <p>
          ECPE runs as a desktop app (Electron), not in Chrome. You opened the Vite dev server by
          accident.
        </p>
        <ol>
          <li>Close this browser tab.</li>
          <li>In Terminal: <code>pnpm dev:stop</code> then <code>pnpm dev:desktop</code></li>
          <li>Use the <strong>ECPE</strong> window that opens (not localhost:5173).</li>
        </ol>
      </div>
    {:else if view === 'home'}
      <div class="card">
        <h2>Start</h2>
        <p class="muted">Create a multi-episode course, open an existing one, or start a standalone video.</p>
        <div class="home-actions">
          <button onclick={() => startCreate('course')} disabled={busy}>New course</button>
          <button onclick={pickCourseFolder} disabled={busy}>Load course…</button>
          <button onclick={() => startCreate('single')} disabled={busy}>New single video</button>
        </div>
      </div>

      <div class="card">
        <h2>Recent courses</h2>
        {#if settings?.recentCourses?.length}
          {#each settings.recentCourses as c}
            <div class="actions">
              <button class="secondary" onclick={() => openCourse(c)}>{c}</button>
            </div>
          {/each}
        {:else}
          <p class="muted">No courses yet</p>
        {/if}
      </div>

      <div class="card">
        <h2>Recent videos</h2>
        {#if settings?.recentProjects?.length}
          {#each settings.recentProjects as p}
            <div class="actions">
              <button class="secondary" onclick={() => openProject(p)}>{p}</button>
            </div>
          {/each}
        {:else}
          <p class="muted">No videos yet</p>
        {/if}
      </div>

      {#if logs.length}
        <div class="card">
          <h3>Log</h3>
          <div class="log">
            {#each logs as line}<div>{line}</div>{/each}
          </div>
        </div>
      {/if}
    {:else if view === 'create'}
      <div class="card">
        <h2>{createMode === 'course' ? 'New course' : 'New single video'}</h2>
        <p class="muted">
          {#if createMode === 'course'}
            Course folder with channel context. Episodes are added after creation.
          {:else}
            Creates a standalone video folder — same pipeline as before.
          {/if}
        </p>

        <label>
          {createMode === 'course' ? 'Course name' : 'Project label'}
          {#if createMode === 'course'}
            <span class="muted">(required)</span>
          {:else}
            <span class="muted">(optional if roadmap is provided)</span>
          {/if}
          <input
            bind:value={newName}
            placeholder={createMode === 'course'
              ? 'e.g. AI Support Copilot'
              : 'Folder name — or leave empty if roadmap is provided'}
          />
        </label>

        {#if createMode === 'course'}
          <label>
            Description <span class="muted">(optional)</span>
            <input bind:value={newDescription} placeholder="Short course summary" />
          </label>
          <label>
            Course type
            <select bind:value={newCourseKind}>
              <option value="build-app">Build App — walkthrough of a real repository</option>
              <option value="theory">Theory course — narrative only, no code binding</option>
            </select>
          </label>
          {#if newCourseKind === 'build-app'}
            <div class="brief-section">
              <div class="brief-header">
                <div>
                  <div class="field-label">
                    Application repository (local path) <span class="muted">(required)</span>
                  </div>
                  <p class="muted">
                    Absolute path to your built app. Stored in <code>course.yaml</code> — editable later in
                    course settings.
                  </p>
                </div>
                <button
                  class="secondary"
                  type="button"
                  onclick={() => pickAppRepoFolder(true)}
                  disabled={busy}
                >
                  Choose folder…
                </button>
              </div>
              <input bind:value={newAppRepoPath} placeholder="/Users/you/projects/my-app" />
            </div>
            <label>
              Repository URL <span class="muted">(optional — for viewer instructions)</span>
              <input bind:value={newAppRepoUrl} placeholder="https://github.com/you/my-app" />
            </label>
          {/if}
        {/if}

        {#if createMode === 'single'}
          <label>
            Topic <span class="muted">(optional)</span>
            <input bind:value={newTopic} placeholder="Episode topic if using a narrative" />
          </label>

          <div class="brief-section">
            <div class="brief-header">
              <div>
                <div class="field-label">
                  Creator roadmap
                  <span class="muted">(optional)</span>
                </div>
                <p class="muted">Saved as <code>source-brief.md</code> and sent to every pipeline stage.</p>
              </div>
              <button class="secondary" type="button" onclick={() => importTextFile('new')} disabled={busy}>
                Import file…
              </button>
            </div>
            <textarea bind:value={newSourceBrief} rows="14" placeholder="Paste your video roadmap here…"></textarea>
          </div>
        {/if}

        <div class="folder-row">
          <div>
            <div class="field-label">{createMode === 'course' ? 'Courses folder' : 'Singles folder'}</div>
            <div class="folder-path">{targetFolder || 'Loading…'}</div>
            <p class="muted">
              Default: Desktop → ECPE → {createMode === 'course' ? 'courses' : 'singles'}
            </p>
          </div>
          <button class="secondary" onclick={() => pickTargetFolder('create')} disabled={busy}>
            Choose folder…
          </button>
        </div>

        <div class="actions">
          <button class="secondary" onclick={() => (view = 'home')} disabled={busy}>Back</button>
          <button onclick={createProject} disabled={!canCreate || busy}>
            {busy ? 'Creating…' : createMode === 'course' ? 'Create course' : 'Create video'}
          </button>
        </div>
      </div>
    {:else if view === 'course' && courseInfo}
      <div class="card">
        <h2>{courseInfo.course.name}</h2>
        {#if courseInfo.course.description}
          <p class="muted">{courseInfo.course.description}</p>
        {/if}
        <p class="muted">
          Type: {courseInfo.course.builds_application ? 'Build App' : 'Theory'}
          · {courseInfo.episodes.length} episode(s)
        </p>
        {#if courseInfo.course.builds_application}
          <p class="muted">
            Each episode needs a theoretical roadmap (<code>source-brief.md</code>) and a demo walkthrough
            section from demo-by-episodes. <code>episode-code.json</code> is generated automatically.
          </p>
        {/if}
        <div class="actions">
          <button class="secondary" onclick={() => window.ecpe?.openFolder(courseRoot)}>Open course folder</button>
          <button class="secondary" onclick={refreshCourseInfo} disabled={busy}>Refresh</button>
        </div>
      </div>

      {#if courseInfo.course.builds_application}
        <div class="card">
          <h2>Application repository</h2>
          <p class="muted">
            Local path to your built app on this machine. All episodes use the same path. If you move the
            folder, update the path here — completed episodes are not modified.
          </p>
          {#if courseInfo.appRepo && !courseInfo.appRepo.accessible}
            <div class="warning-banner">
              Repository path is not reachable: {courseInfo.appRepo.configuredPath || '(not set)'}.
              {courseInfo.appRepo.message ?? ''} Update the path below before running pipeline stages
              that need source files.
            </div>
          {:else if courseInfo.appRepo?.message}
            <p class="muted">{courseInfo.appRepo.message}</p>
          {/if}
          <div class="brief-section">
            <div class="brief-header">
              <div>
                <div class="field-label">Local path</div>
              </div>
              <button class="secondary" type="button" onclick={() => pickAppRepoFolder(false)} disabled={busy}>
                Choose folder…
              </button>
            </div>
            <input
              bind:value={courseAppRepoPath}
              oninput={() => (courseAppRepoDirty = true)}
              placeholder="/Users/you/projects/my-app"
            />
          </div>
          <label>
            Repository URL <span class="muted">(optional)</span>
            <input
              bind:value={courseAppRepoUrl}
              oninput={() => (courseAppRepoDirty = true)}
              placeholder="https://github.com/you/my-app"
            />
          </label>
          <div class="actions">
            <button onclick={saveCourseAppRepo} disabled={busy || !courseAppRepoDirty || !courseAppRepoPath.trim()}>
              Save repository settings
            </button>
          </div>
        </div>
      {/if}

      <div class="card">
        <h2>Course schema</h2>
        <p class="muted">Episode map for this course. Click an episode to open its pipeline.</p>
        <div class="course-schema">
          {#if courseInfo.episodes.length}
            {#each courseInfo.episodes as ep}
              <button type="button" class="episode-card" onclick={() => openProject(ep.root)} disabled={busy}>
                <span class="ep-num">E{String(ep.episode).padStart(2, '0')}</span>
                <div class="ep-body">
                  <p class="ep-title">{ep.title}</p>
                  <p class="ep-meta">{ep.folder}</p>
                  <div class="artifact-dots" title="Script · Plan · Manifest · Code">
                    <span class="artifact-dot" class:on={ep.artifactFlags.finalScript}></span>
                    <span class="artifact-dot" class:on={ep.artifactFlags.productionPlan}></span>
                    <span class="artifact-dot" class:on={ep.artifactFlags.editManifest}></span>
                    {#if courseInfo.course.builds_application}
                      <span class="artifact-dot code" class:on={ep.hasEpisodeCode} title="episode-code.json"></span>
                    {/if}
                  </div>
                </div>
                <span class="status-pill {ep.status}">{episodeStatusLabel(ep.status)}</span>
              </button>
            {/each}
          {:else}
            <p class="muted">No episodes yet — create the first episode below.</p>
          {/if}
        </div>
      </div>

      <div class="card">
        <h2>{courseInfo.episodes.length === 0 ? 'Create first episode' : 'Add episode'}</h2>
        <label>
          Title
          <input bind:value={newEpisodeTitle} placeholder="Episode title" />
        </label>
        <label>
          Topic <span class="muted">(optional)</span>
          <input bind:value={newEpisodeTopic} placeholder="Short topic line" />
        </label>
        <label>
          Narrative balance
          <select bind:value={newEpisodeNarrativeBalance} disabled={busy}>
            <option value="theory-first">Theory-first — more concepts, still show code</option>
            <option value="balanced">Balanced — ~50/50</option>
            <option value="practice-first">Practice-first — walkthrough + short recap</option>
          </select>
        </label>
        <p class="muted">
          Written into this episode's <code>video.yaml</code> on create
          {#if courseInfo.course.builds_application}
            (build-app default: practice-first unless course sets <code>default_narrative_balance</code>)
          {/if}
          .
        </p>
        <div class="brief-section">
          <div class="brief-header">
            <div>
              <div class="field-label">
                Episode outline
                {#if courseInfo.course.builds_application}
                  <span class="muted">(optional)</span>
                {:else}
                  <span class="muted">(optional)</span>
                {/if}
              </div>
              <p class="muted">
                Topic blocks and talking points for this episode (no clock timecodes). Saved as
                <code>source-brief.md</code>. For build-app, Demo walkthrough is the primary spine.
              </p>
            </div>
            <button
              class="secondary"
              type="button"
              onclick={() => importTextFile('episodeBrief')}
              disabled={busy}
            >
              Import file…
            </button>
          </div>
          <textarea
            bind:value={newEpisodeBrief}
            rows="8"
            placeholder="Paste topic outline for this episode (optional)…"
          ></textarea>
        </div>
        {#if courseInfo.course.builds_application}
          <div class="brief-section">
            <div class="brief-header">
              <div>
                <div class="field-label">Demo walkthrough <span class="muted">(required)</span></div>
                <p class="muted">
                  Paste the <code>## EP0N</code> section from demo-by-episodes.md — what was implemented,
                  file walkthrough, demo commands. Saved as <code>episode-authoring.yaml</code>; generates
                  <code>episode-code.json</code> for models and B-roll.
                </p>
              </div>
              <button class="secondary" type="button" onclick={() => importDemoByEpisodes('create')} disabled={busy}>
                Import demo-by-episodes…
              </button>
            </div>
            <textarea
              bind:value={newEpisodeDemoWalkthrough}
              rows="10"
              placeholder="## EP01 — … (from demo-by-episodes.md)"
            ></textarea>
          </div>
          <label>
            Research focus <span class="muted">(optional)</span>
            <textarea
              bind:value={newEpisodeResearchFocus}
              rows="2"
              placeholder="e.g. Focus on chunker.py overlap; skip Docker deep-dive"
            ></textarea>
          </label>
          <label>
            Review focus <span class="muted">(optional)</span>
            <textarea
              bind:value={newEpisodeReviewFocus}
              rows="2"
              placeholder="e.g. Verify walkthrough order matches implementation steps"
            ></textarea>
          </label>
        {/if}
        <div class="actions">
          <button onclick={createEpisode} disabled={!canCreateEpisode || busy}>
            {busy ? 'Creating…' : courseInfo.episodes.length === 0 ? 'Create first episode' : 'Create episode'}
          </button>
        </div>
      </div>

      <div class="card">
        <h2>Prior coverage</h2>
        <p class="muted">
          <strong>Not the same as a episode roadmap.</strong> This is channel-level: what viewers already learned
          from <em>other</em> videos (e.g. your Fundamental AI playlist). The pipeline will not re-teach these from
          scratch in any episode. Your per-episode plan still lives in each episode's <code>source-brief.md</code>.
        </p>
        <textarea
          bind:value={priorCoverage}
          oninput={() => (priorCoverageDirty = true)}
          rows="10"
          placeholder="chunking, embeddings, vector stores, basic RAG overview…"
        ></textarea>
        <div class="actions">
          <button onclick={savePriorCoverage} disabled={!priorCoverageDirty || busy}>Save prior coverage</button>
        </div>
      </div>

      <div class="card">
        <h2>Application state</h2>
        <p class="muted">
          Shared build context injected into every episode pipeline (LLM stages). Update manually as the app grows
          across episodes.
        </p>
        <textarea
          bind:value={applicationState}
          oninput={() => (applicationStateDirty = true)}
          rows="14"
          placeholder="What exists in the app so far — stack, features, file structure…"
        ></textarea>
        <div class="actions">
          <button onclick={saveApplicationState} disabled={!applicationStateDirty || busy}>Save application state</button>
        </div>
      </div>
    {:else if view === 'project' && projectRoot}
      <div class="card">
        <h2>Creator roadmap</h2>
        <p class="muted">
          Optional topic outline for LLM stages (no clock timecodes). For build-app, Demo walkthrough is the primary spine.
        </p>
        <div class="actions">
          <button class="secondary" type="button" onclick={() => importTextFile('project')} disabled={busy}>
            Import file…
          </button>
          <button onclick={saveSourceBrief} disabled={busy}>Save roadmap</button>
        </div>
        <textarea bind:value={sourceBrief} rows="16" placeholder="No roadmap yet — paste or import a planning doc"></textarea>
      </div>

      {#if courseInfo?.course.builds_application}
        <div class="card">
          <h2>Episode authoring (build-app)</h2>
          <p class="muted">
            Paste one <code>## EP0N</code> section from demo-by-episodes.md. Saving also regenerates
            <code>episode-code.json</code> (cumulative scope includes prior episodes).
          </p>
          {#if episodeCodeSummary}
            <p class="muted">{episodeCodeSummary}</p>
          {/if}
          <div class="actions">
            <button class="secondary" type="button" onclick={() => importDemoByEpisodes('project')} disabled={busy}>
              Import demo-by-episodes…
            </button>
            <button
              class="secondary"
              type="button"
              onclick={regenerateEpisodeCode}
              disabled={busy || !demoWalkthroughMd.trim()}
            >
              Regenerate episode-code
            </button>
            <button onclick={saveEpisodeAuthoring} disabled={!authoringDirty || busy}>
              Save authoring
            </button>
          </div>
          <label>
            Demo walkthrough (episode section)
            <textarea
              bind:value={demoWalkthroughMd}
              oninput={() => (authoringDirty = true)}
              rows="12"
              placeholder="Paste ## EP02 — … section from demo-by-episodes.md"
            ></textarea>
          </label>
          <label>
            Research focus <span class="muted">(optional)</span>
            <textarea
              bind:value={researchFocusMd}
              oninput={() => (authoringDirty = true)}
              rows="3"
              placeholder="e.g. Concentrate on chunker.py overlap logic; skip Docker deep-dive"
            ></textarea>
          </label>
          <label>
            Technical review focus <span class="muted">(optional)</span>
            <textarea
              bind:value={reviewFocusMd}
              oninput={() => (authoringDirty = true)}
              rows="3"
              placeholder="e.g. Verify file walkthrough order matches implementation steps"
            ></textarea>
          </label>
        </div>
      {/if}

      <div class="card">
        <h2>Narrative balance</h2>
        <p class="muted">
          Controls theory vs practice depth for research and script stages. Topic boosts override specific subjects.
          Prior coverage is set at course level.
          {#if courseInfo?.course.builds_application}
            <br />
            Build-app targets: practice-first ~65–75% code/demo; balanced ~50/50; theory-first ~65% theory / ~35% practice (still not a pure lecture).
          {/if}
        </p>
        <label>
          Mode
          <select
            bind:value={narrativeBalance}
            onchange={onNarrativeChange}
            disabled={busy}
          >
            <option value="theory-first">Theory-first — teach from scratch</option>
            <option value="balanced">Balanced — partial prior knowledge</option>
            <option value="practice-first">Practice-first — prepared viewer, recap + practice</option>
          </select>
        </label>
        <label>
          Theory boost <span class="muted">(comma-separated topics)</span>
          <input
            bind:value={theoryBoost}
            oninput={onNarrativeChange}
            placeholder="RagMemory, reranking"
            disabled={busy}
          />
        </label>
        <label>
          Practice boost <span class="muted">(comma-separated topics)</span>
          <input
            bind:value={practiceBoost}
            oninput={onNarrativeChange}
            placeholder="chunking strategies, metadata filters"
            disabled={busy}
          />
        </label>
        <div class="actions">
          <button onclick={saveNarrativeSettings} disabled={!narrativeDirty || busy}>
            Save narrative settings
          </button>
        </div>
      </div>

      <div class="card">
        <h2>Channel &amp; video context</h2>
        {#if pipelineStarted}
          <p class="status-banner locked">Pipeline has run — context is locked for this project.</p>
        {:else if contextSaved && !contextEditing}
          <p class="status-banner saved">Context saved. Click Edit to change channel or video settings.</p>
        {:else}
          <p class="muted">Set channel voice and video defaults, then Save context before running the pipeline.</p>
        {/if}
        <div class="grid-2">
          <div>
            <h3>channel.yaml</h3>
            <textarea bind:value={channelYaml} rows="10" readonly={contextFieldsLocked} class:locked={contextFieldsLocked}></textarea>
          </div>
          <div>
            <h3>video.yaml</h3>
            <textarea bind:value={videoYaml} rows="10" readonly={contextFieldsLocked} class:locked={contextFieldsLocked}></textarea>
          </div>
        </div>
        <div class="actions">
          <button onclick={saveChannelVideo} disabled={!canSaveContext}>Save context</button>
          <button class="secondary" onclick={startContextEdit} disabled={!canEditContext}>Edit</button>
        </div>
      </div>

      <div class="card">
        <h2>Pipeline</h2>
        <div class="actions">
          <button onclick={() => run('knowledge')} disabled={busy}>Run knowledge</button>
          <button onclick={() => run('production')} disabled={busy}>Run production</button>
        </div>
        <label>Revision notes <textarea bind:value={revision} rows="2"></textarea></label>
        <h3>Knowledge stages</h3>
        <div class="actions">
          {#each knowledgeStages as s}
            <button class="secondary" onclick={() => run(s)} disabled={busy}
              >{s}{stageDone(s) ? ' ✓' : ''}</button
            >
          {/each}
        </div>
        {#if isCourseEpisode}
          <h3>Course continuity</h3>
          <p class="muted small">
            <strong>Auto:</strong> after <code>youtube-editor</code>, episode-wrap runs when
            <code>final-script.md</code> changed — updates course <code>application-state.md</code>
            (incl. project tree). Unchanged script → skip. Re-run youtube-editor with edits → re-wrap.
          </p>
          <div class="actions">
            <button
              class="secondary"
              onclick={() => run('episode-wrap')}
              disabled={busy || !projectInfo?.artifacts?.finalScript}
              title="Force re-wrap even if script hash unchanged"
            >
              Force episode-wrap{stageDone('episode-wrap') ? ' ✓' : ''}
            </button>
          </div>
        {/if}
        <h3>Production stages</h3>
        <div class="motion-mix">
          <div class="field-label">Motion mix (mermaid / excalidraw / ui-cards)</div>
          <p class="muted small">
            Code, terminal, browser, and illustration are always static. Motion renderer is always MP4.
            The mix applies at the render-assets stage.
          </p>
          <div class="motion-steps">
            {#each MOTION_RATIO_STEPS as step}
              <button
                type="button"
                class="secondary"
                class:selected={motionRatioPercent === step}
                disabled={busy}
                onclick={() => onMotionRatioChange(step)}
              >
                {step === 0 ? '0%' : step === 100 ? '100%' : `${step}%`}
              </button>
            {/each}
          </div>
          <p class="motion-label">{motionRatioLabel(motionRatioPercent)}</p>
          {#if motionPreview}
            <p class="muted small motion-stats">
              Fixed static: {motionPreview.fixed_static} · already MP4 (motion): {motionPreview.already_motion}
              · animatable pool: {motionPreview.animatable} → MP4: {motionPreview.selected_animated},
              PNG/HTML: {motionPreview.selected_static_animatable}
            </p>
          {:else if projectInfo?.artifacts?.productionPlan}
            <p class="muted small">Loading plan…</p>
          {:else}
            <p class="muted small">Stats appear after visual-plan</p>
          {/if}
        </div>
        <div class="actions">
          {#each productionStages as s}
            <button class="secondary" onclick={() => run(s)} disabled={busy}
              >{s}{stageDone(s) ? ' ✓' : ''}</button
            >
          {/each}
        </div>
      </div>

      <div class="card grid-2">
        <div>
          <h3>Artifact</h3>
          <select bind:value={artifactName} onchange={() => loadArtifact(artifactName)}>
            <option value="source-brief.md">source-brief.md</option>
            <option value="research.md">research.md</option>
            <option value="technical-review.md">technical-review.md</option>
            <option value="script.md">script.md</option>
            <option value="educational-review.md">educational-review.md</option>
            <option value="final-script.md">final-script.md</option>
            <option value="narration-segments.json">narration-segments.json</option>
            <option value="production-plan.json">production-plan.json</option>
            <option value="edit-manifest.json">edit-manifest.json</option>
          </select>
          {#if artifactName.endsWith('.md')}
            <div class="markdown">{@html marked.parse(artifactContent || '')}</div>
          {:else}
            <pre>{artifactContent}</pre>
          {/if}
        </div>
        <div>
          <h3>Log</h3>
          <div class="log">
            {#each logs as line}<div>{line}</div>{/each}
          </div>
        </div>
      </div>
    {:else if view === 'montage' && projectRoot}
      <div class="card">
        <div class="actions">
          <button onclick={exportMontageGuide}>Export montage-guide.md</button>
          <button class="secondary" onclick={exportCsv}>Export edit-manifest.csv</button>
          <button class="secondary" onclick={() => window.ecpe?.openFolder(projectRoot)}
            >Open project folder</button
          >
        </div>

        {#if uncoveredSentences.length > 0}
          <div class="warning-banner">
            ⚠ {uncoveredSentences.length} sentence(s) without a rendered asset — see block detail or
            export montage-guide.md
          </div>
        {/if}

        <div class="grid-2">
          <div>
            <h3>Script blocks</h3>
            {#if blocks?.blocks}
              {#each blocks.blocks as block}
                <button
                  type="button"
                  class="segment-card"
                  class:selected={selectedBlockId === block.block_id}
                  onclick={() => {
                    selectedBlockId = block.block_id;
                    selectedEntryIndex = null;
                  }}
                >
                  <strong>{block.block_id}</strong> — {block.title}
                  <p class="muted">
                    {block.sentences.length} sentences · {block.word_count} words · ~{Math.round(
                      (block.estimated_duration_sec / 60) * 10,
                    ) / 10} min
                  </p>
                  <p class="muted">{block.narration_text.slice(0, 200)}…</p>
                </button>
              {/each}
            {:else}
              <p class="muted">Run the segment stage first (v2 blocks)</p>
            {/if}
          </div>
          <div>
            <h3>Edit manifest</h3>
            {#if manifest?.entries}
              <table>
                <thead>
                  <tr>
                    <th>Block</th><th>Scene</th><th>Sentences</th><th>Asset</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {#each manifest.entries as row, i}
                    <tr
                      class:selected={selectedEntryIndex === i}
                      class:dimmed={selectedBlockId && row.block_id !== selectedBlockId}
                      onclick={() => selectManifestRow(row, i)}
                    >
                      <td>{row.block_id}</td>
                      <td>{row.scene_order}</td>
                      <td>{row.sentence_start}–{row.sentence_end}</td>
                      <td class="asset-cell">{row.asset_path || '—'}</td>
                      <td>{row.status}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <p class="muted">Run render-assets first</p>
            {/if}
          </div>
        </div>

        {#if selectedEntry || selectedBlock}
          <div class="card detail-panel">
            <h3>Selection detail</h3>
            {#if selectedEntry}
              <p><strong>Asset:</strong> <code>{selectedEntry.asset_path || 'FAILED'}</code></p>
              <p><strong>Renderer:</strong> {selectedEntry.renderer} · <strong>Hold:</strong> ~{selectedEntry.estimated_hold_sec}s</p>
              <p><strong>Sentences:</strong> {selectedEntry.sentence_start}–{selectedEntry.sentence_end}</p>
              {#if selectedEntry.narration_span}
                <blockquote class="narration-span">{selectedEntry.narration_span}</blockquote>
              {/if}
              {#if selectedEntry.visual}
                <p class="muted"><strong>Visual:</strong> {selectedEntry.visual}</p>
              {/if}
              {#if selectedEntry.insert_hint}
                <p class="muted"><strong>Insert hint:</strong> {selectedEntry.insert_hint}</p>
              {/if}
            {/if}
            {#if selectedBlock}
              <h4>Block {selectedBlock.block_id}: {selectedBlock.title}</h4>
              {#if selectedBlock.on_screen_action}
                <p class="muted"><strong>On screen:</strong> {selectedBlock.on_screen_action}</p>
              {/if}
              <div class="sentence-list">
                {#each selectedBlock.sentences as s}
                  {@const covered = manifest?.entries?.some(
                    (e: { block_id: string; status: string; sentence_start: number; sentence_end: number }) =>
                      e.block_id === selectedBlock.block_id &&
                      e.status === 'ok' &&
                      e.sentence_start <= s.index &&
                      e.sentence_end >= s.index,
                  )}
                  <div class="sentence-row" class:uncovered={!covered} class:highlighted={selectedEntry && selectedEntry.sentence_start <= s.index && selectedEntry.sentence_end >= s.index}>
                    <span class="sentence-idx">[{s.index}]</span>
                    {s.text}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {:else if view === 'settings'}
      <div class="card">
        <h2>Settings</h2>

        <div class="folder-row">
          <div>
            <div class="field-label">Courses folder</div>
            <div class="folder-path">{settings?.defaultCoursesRoot ?? DEFAULT_COURSES_FOLDER}</div>
          </div>
          <button class="secondary" onclick={() => pickTargetFolder('settings-courses')}>Choose folder…</button>
        </div>

        <div class="folder-row">
          <div>
            <div class="field-label">Singles folder</div>
            <div class="folder-path">{settings?.defaultSinglesRoot ?? DEFAULT_SINGLES_FOLDER}</div>
          </div>
          <button class="secondary" onclick={() => pickTargetFolder('settings-singles')}>Choose folder…</button>
        </div>

        <h3>LLM status</h3>
        {#if llmLoading}
          <p class="muted">Checking…</p>
        {:else if Object.keys(llmStatus).length === 0}
          <p class="muted">No data</p>
        {:else}
          <ul class="status-list">
            {#each Object.entries(llmStatus) as [provider, status]}
              <li><strong>{provider}:</strong> {status}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </main>
</div>
