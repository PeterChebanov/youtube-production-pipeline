<script lang="ts">
  import { marked } from 'marked';

  type View = 'home' | 'project' | 'montage' | 'settings';

  let view: View = $state('home');
  let settings = $state<{ defaultProjectsRoot: string; recentProjects: string[] } | null>(null);
  let projectRoot = $state('');
  let projectInfo = $state<any>(null);
  let logs = $state<string[]>([]);
  let busy = $state(false);
  let revision = $state('');

  let newName = $state('');
  let newTopic = $state('');
  let newParentDir = $state('');

  let channelYaml = $state('');
  let videoYaml = $state('');
  let artifactName = $state('final-script.md');
  let artifactContent = $state('');

  let manifest = $state<any>(null);
  let segments = $state<any>(null);
  let selectedSegmentId = $state<string | null>(null);

  let llmStatus = $state<Record<string, string>>({});

  const knowledgeStages = [
    'research',
    'technical-review',
    'script-writer',
    'educational-review',
    'youtube-editor',
    'segment',
  ];
  const productionStages = ['visual-plan', 'render-assets'];

  async function refreshSettings() {
    settings = await window.ecpe.getSettings();
    if (!newParentDir) newParentDir = settings.defaultProjectsRoot;
    llmStatus = await window.ecpe.llmStatus();
  }

  async function openProject(root: string) {
    projectRoot = root;
    projectInfo = await window.ecpe.getProjectInfo(root);
    const y = await window.ecpe.getChannelVideo(root);
    channelYaml = y.channelYaml;
    videoYaml = y.videoYaml;
    await loadArtifact(artifactName);
    await loadMontageData();
    view = 'project';
  }

  async function loadArtifact(name: string) {
    if (!projectRoot) return;
    artifactName = name;
    artifactContent = await window.ecpe.getArtifact(projectRoot, name);
  }

  async function loadMontageData() {
    if (!projectRoot) return;
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
    if (!projectRoot) return;
    busy = true;
    log(`Running ${stageId}…`);
    try {
      const result = await window.ecpe.runPipeline(stageId, {
        projectPath: projectRoot,
        revisionNotes: revision || undefined,
      });
      log(`Done: ${result.stages.join(', ')}`);
      projectInfo = await window.ecpe.getProjectInfo(projectRoot);
      await loadArtifact(artifactName);
      await loadMontageData();
    } catch (err) {
      log(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function createProject() {
    busy = true;
    try {
      const { root } = await window.ecpe.createProject({
        name: newName,
        topic: newTopic || undefined,
        parentDir: newParentDir || undefined,
      });
      await openProject(root);
      settings = await window.ecpe.getSettings();
    } catch (err) {
      log(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function saveChannelVideo() {
    if (!projectRoot) return;
    await window.ecpe.saveChannelVideo(projectRoot, channelYaml, videoYaml);
    projectInfo = await window.ecpe.getProjectInfo(projectRoot);
    log('Saved channel.yaml and video.yaml');
  }

  async function exportCsv() {
    if (!projectRoot) return;
    const { path } = await window.ecpe.exportManifestCsv(projectRoot);
    log(`Exported ${path}`);
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

  $effect(() => {
    refreshSettings();
    const off = window.ecpe.onProgress((p) => log(`${p.stage}: ${p.message}`));
    return off;
  });
</script>

<div class="layout">
  <aside class="sidebar">
    <h1>ECPE</h1>
    <div class="nav">
      <button class:active={view === 'home'} onclick={() => (view = 'home')}>Projects</button>
      <button class:active={view === 'project'} onclick={() => (view = 'project')} disabled={!projectRoot}
        >Pipeline</button
      >
      <button class:active={view === 'montage'} onclick={() => (view = 'montage')} disabled={!projectRoot}
        >Montage</button
      >
      <button class:active={view === 'settings'} onclick={() => (view = 'settings')}>Settings</button>
    </div>
    {#if projectRoot}
      <p class="muted" style="font-size:12px; word-break:break-all;">{projectRoot}</p>
    {/if}
  </aside>

  <main class="content">
    {#if view === 'home'}
      <div class="card">
        <h2>New project</h2>
        <label>Name <input bind:value={newName} /></label>
        <label>Topic <input bind:value={newTopic} /></label>
        <label>Parent directory <input bind:value={newParentDir} /></label>
        <div class="actions">
          <button onclick={() => window.ecpe.pickDirectory().then((d) => d && (newParentDir = d))} class="secondary"
            >Pick folder</button
          >
          <button onclick={createProject} disabled={!newName || busy}>Create</button>
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
          <p class="muted">No recent projects</p>
        {/if}
      </div>
    {/if}

    {#if view === 'project' && projectRoot}
      <div class="card">
        <h2>Channel & Video context</h2>
        <div class="grid-2">
          <div>
            <h3>channel.yaml</h3>
            <textarea bind:value={channelYaml} rows="10"></textarea>
          </div>
          <div>
            <h3>video.yaml</h3>
            <textarea bind:value={videoYaml} rows="10"></textarea>
          </div>
        </div>
        <div class="actions">
          <button onclick={saveChannelVideo}>Save context</button>
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
          <h3>Progress log</h3>
          <div class="log">
            {#each logs as line}<div>{line}</div>{/each}
          </div>
        </div>
      </div>
    {/if}

    {#if view === 'montage' && projectRoot}
      <div class="card">
        <div class="actions">
          <button onclick={exportCsv}>Export edit-manifest.csv</button>
          <button class="secondary" onclick={() => window.ecpe.openFolder(projectRoot)}>Open project folder</button>
        </div>
        <div class="grid-2">
          <div>
            <h3>Script segments</h3>
            {#if segments?.segments}
              {#each segments.segments as seg}
                <div
                  class="card"
                  style:outline={selectedSegmentId === seg.id ? '2px solid #3b82f6' : 'none'}
                  onclick={() => (selectedSegmentId = seg.id)}
                >
                  <strong>{seg.id}</strong> {seg.start_timecode}–{seg.end_timecode}
                  <p class="muted">{seg.text}</p>
                </div>
              {/each}
            {:else}
              <p class="muted">Run segment stage first</p>
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
    {/if}

    {#if view === 'settings'}
      <div class="card">
        <h2>Settings</h2>
        <label
          >Default projects root
          <input
            value={settings?.defaultProjectsRoot ?? ''}
            oninput={(e) =>
              settings &&
              (settings = {
                ...settings,
                defaultProjectsRoot: (e.currentTarget as HTMLInputElement).value,
              })}
          />
        </label>
        <div class="actions">
          <button
            onclick={() =>
              settings && window.ecpe.saveSettings({ defaultProjectsRoot: settings.defaultProjectsRoot })}
            >Save</button
          >
        </div>
        <h3>LLM status</h3>
        <pre>{JSON.stringify(llmStatus, null, 2)}</pre>
      </div>
    {/if}
  </main>
</div>
