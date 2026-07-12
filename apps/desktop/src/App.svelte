<script lang="ts">
  import { marked } from 'marked';
  import { onMount } from 'svelte';

  type View = 'home' | 'project' | 'montage' | 'settings';

  let view: View = $state('home');
  let settings = $state<{ defaultProjectsRoot: string; recentProjects: string[] } | null>(null);
  let projectRoot = $state('');
  let projectInfo = $state<any>(null);
  let logs = $state<string[]>([]);
  let busy = $state(false);
  let revision = $state('');
  let errorMessage = $state('');
  let bridgeReady = $state(false);

  let newName = $state('');
  let newTopic = $state('');
  let newSourceBrief = $state('');
  let projectsFolder = $state('');

  let channelYaml = $state('');
  let videoYaml = $state('');
  let contextSaved = $state(true);
  let contextEditing = $state(false);
  let sourceBrief = $state('');
  let artifactName = $state('final-script.md');
  let artifactContent = $state('');

  let manifest = $state<any>(null);
  let segments = $state<any>(null);
  let selectedSegmentId = $state<string | null>(null);

  let llmStatus = $state<Record<string, string>>({});
  let llmLoading = $state(false);

  const DEFAULT_PROJECTS_FOLDER = '~/Desktop/ECPE/projects';

  let canCreate = $derived(!!newSourceBrief.trim() || !!newName.trim());

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
    projectsFolder = settings.defaultProjectsRoot;
    llmLoading = true;
    try {
      llmStatus = await window.ecpe.llmStatus();
    } catch (err) {
      llmStatus = { error: err instanceof Error ? err.message : String(err) };
    } finally {
      llmLoading = false;
    }
  }

  async function importTextFile(target: 'new' | 'project') {
    if (!window.ecpe) return;
    clearError();
    try {
      const file = await window.ecpe.pickTextFile();
      if (!file) return;
      if (target === 'new') {
        newSourceBrief = file.content;
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

  async function pickProjectsFolder(target: 'new' | 'settings') {
    if (!window.ecpe) return;
    clearError();
    try {
      const start = target === 'new' ? projectsFolder : settings?.defaultProjectsRoot;
      const picked = await window.ecpe.pickDirectory(start);
      if (!picked) return;
      if (target === 'new') {
        projectsFolder = picked;
      } else if (settings) {
        settings = { ...settings, defaultProjectsRoot: picked };
        await window.ecpe.saveSettings({ defaultProjectsRoot: picked });
        projectsFolder = picked;
        log(`Projects folder: ${picked}`);
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
      contextSaved = true;
      contextEditing = false;
      await loadSourceBrief();
      await loadArtifact(artifactName);
      await loadMontageData();
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
      segments = JSON.parse(await window.ecpe.getArtifact(projectRoot, 'narration-segments.json'));
    } catch {
      segments = null;
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
      const result = await window.ecpe.runPipeline(stageId, {
        projectPath: projectRoot,
        revisionNotes: revision || undefined,
      });
      log(`Done: ${result.stages.join(', ')}`);
      projectInfo = await window.ecpe.getProjectInfo(projectRoot);
      contextSaved = true;
      contextEditing = false;
      await loadArtifact(artifactName);
      await loadMontageData();
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
    if (!newSourceBrief.trim() && !newName.trim()) {
      setError('Paste a creator roadmap or enter a project label.');
      return;
    }
    busy = true;
    clearError();
    log('Creating project…');
    try {
      const { root } = await window.ecpe.createProject({
        name: newName.trim() || undefined,
        topic: newTopic.trim() || undefined,
        parentDir: projectsFolder || undefined,
        sourceBrief: newSourceBrief.trim() || undefined,
      });
      await openProject(root);
      settings = await window.ecpe.getSettings();
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
      await window.ecpe.saveChannelVideo(projectRoot, channelYaml, videoYaml);
      projectInfo = await window.ecpe.getProjectInfo(projectRoot);
      contextSaved = true;
      contextEditing = false;
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

  function stageDone(id: string): boolean {
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
      projectsFolder = DEFAULT_PROJECTS_FOLDER;
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
      <button class:active={view === 'home'} onclick={() => (view = 'home')}>Project</button>
      <button class:active={view === 'project'} onclick={() => projectRoot && (view = 'project')} disabled={!projectRoot}
        >Pipeline</button
      >
      <button class:active={view === 'montage'} onclick={() => projectRoot && (view = 'montage')} disabled={!projectRoot}
        >Montage</button
      >
      <button class:active={view === 'settings'} onclick={() => (view = 'settings')}>Settings</button>
    </div>
    {#if projectRoot}
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
        <h2>New video</h2>
        <p class="muted">
          Create a project folder on disk. Scripts, assets, and channel context for this video live inside.
        </p>

        <label>
          Project label <span class="muted">(optional)</span>
          <input bind:value={newName} placeholder="Folder name — or leave empty if roadmap is provided" />
        </label>

        <label>
          Topic <span class="muted">(optional)</span>
          <input bind:value={newTopic} placeholder="Only if you are not using a roadmap" />
        </label>

        <div class="brief-section">
          <div class="brief-header">
            <div>
              <div class="field-label">Creator roadmap <span class="muted">(optional)</span></div>
              <p class="muted">
                Paste or import your planning doc. Saved as <code>source-brief.md</code> and sent to every
                pipeline stage. Provide a roadmap <em>or</em> a project label — both are optional, but at
                least one is required.
              </p>
            </div>
            <button class="secondary" type="button" onclick={() => importTextFile('new')} disabled={busy}>
              Import file…
            </button>
          </div>
          <textarea
            bind:value={newSourceBrief}
            rows="14"
            placeholder="Paste your video roadmap here…"
          ></textarea>
        </div>

        <div class="folder-row">
          <div>
            <div class="field-label">Projects folder</div>
            <div class="folder-path">{projectsFolder || 'Loading…'}</div>
            <p class="muted">Default: Desktop → ECPE → projects</p>
          </div>
          <button class="secondary" onclick={() => pickProjectsFolder('new')} disabled={busy}>
            Choose folder…
          </button>
        </div>

        <div class="actions">
          <button onclick={createProject} disabled={!canCreate || busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>

      <div class="card">
        <h2>Recent</h2>
        {#if settings?.recentProjects?.length}
          {#each settings.recentProjects as p}
            <div class="actions">
              <button class="secondary" onclick={() => openProject(p)}>{p}</button>
            </div>
          {/each}
        {:else}
          <p class="muted">No projects yet</p>
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
    {:else if view === 'project' && projectRoot}
      <div class="card">
        <h2>Creator roadmap</h2>
        <p class="muted">
          Edit the planning document sent to LLM stages. Pipeline uses this as intent — research still validates and
          expands.
        </p>
        <div class="actions">
          <button class="secondary" type="button" onclick={() => importTextFile('project')} disabled={busy}>
            Import file…
          </button>
          <button onclick={saveSourceBrief} disabled={busy}>Save roadmap</button>
        </div>
        <textarea bind:value={sourceBrief} rows="16" placeholder="No roadmap yet — paste or import a planning doc"></textarea>
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
        <h3>Production stages</h3>
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
          <button onclick={exportCsv}>Export edit-manifest.csv</button>
          <button class="secondary" onclick={() => window.ecpe?.openFolder(projectRoot)}
            >Open project folder</button
          >
        </div>
        <div class="grid-2">
          <div>
            <h3>Script segments</h3>
            {#if segments?.segments}
              {#each segments.segments as seg}
                <button
                  type="button"
                  class="segment-card"
                  class:selected={selectedSegmentId === seg.id}
                  onclick={() => (selectedSegmentId = seg.id)}
                >
                  <strong>{seg.id}</strong> {seg.start_timecode}–{seg.end_timecode}
                  <p class="muted">{seg.text}</p>
                </button>
              {/each}
            {:else}
              <p class="muted">Run the segment stage first</p>
            {/if}
          </div>
          <div>
            <h3>Edit manifest</h3>
            {#if manifest?.entries}
              <table>
                <thead>
                  <tr>
                    <th>In</th><th>Out</th><th>Asset</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {#each manifest.entries as row}
                    <tr
                      class:selected={selectedSegmentId && row.segment_ids?.includes(selectedSegmentId)}
                      onclick={() => (selectedSegmentId = row.segment_ids?.[0] ?? null)}
                    >
                      <td>{row.timecode_in}</td>
                      <td>{row.timecode_out}</td>
                      <td>{row.asset_path || '—'}</td>
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
      </div>
    {:else if view === 'settings'}
      <div class="card">
        <h2>Settings</h2>

        <div class="folder-row">
          <div>
            <div class="field-label">Default projects folder</div>
            <div class="folder-path">{settings?.defaultProjectsRoot ?? '…'}</div>
          </div>
          <button class="secondary" onclick={() => pickProjectsFolder('settings')}>Choose folder…</button>
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
