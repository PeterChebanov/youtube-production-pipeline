# ECPE — Implementation Plan

**Version:** 1.0  
**Status:** Pre-development (source of truth for build)  
**Architecture reference:** `000_SYSTEM_ARCHITECTURE.md` (product architecture, agents, renderers)

This document is the **implementation plan**: technologies, repo layout, UI behavior, file contracts, and phased delivery. It extends the architecture doc with decisions made during planning (Electron, Svelte, Motion Canvas, no React, prompt control, edit manifest).

---

## 1. Product summary

**Educational Content Production Engine (ECPE)** is a **local-first desktop assistant** for one creator producing educational YouTube videos about AI, software engineering, and modern technology.

### What the system does

- Runs a **Knowledge Pipeline** (5 AI agents) from video idea → **`final-script.md`**
- Runs a **Production Pipeline** (Visual Designer AI → deterministic engine) from final script → **production-ready assets**
- Produces a **self-contained project folder** (scripts, plan, assets, logs, edit manifest for DaVinci Resolve)
- Does **not** record narration, does **not** auto-edit the final video, does **not** replace creative decisions

### What the creator still does

- Chooses topic and context
- Records A-roll narration
- Final edit in **DaVinci Resolve**

### UI operating modes (both required)

| Mode | Behavior |
|------|----------|
| **Autopilot** | One button: full Knowledge Pipeline → `final-script.md`. Second button: visual plan + asset generation. Can run unattended (“ready when I arrive”). |
| **Step-by-step** | Run one stage at a time; **preview artifact** after each stage; **revision prompt** (“change X, add Y”) → **regenerate** (replace old file, do not accumulate stale versions). Same for individual assets/scenes in Production. |
| **Drill-down after full run** | After autopilot, open any stage/scene, revise, regenerate from that point. |

### Critical montage requirement

The creator must always know **which part of `final-script.md`**, **which time range**, and **which asset file** belong together. This is enforced via **narration segments**, **production plan**, and **`edit-manifest.json`** (see §5).

### Project output location

- Default projects root (configurable in settings), e.g. `~/Videos/ECPE/projects`
- **Before every run**, UI must allow: **project name/slug** + **custom output directory**
- Entire package lives in one folder for Resolve workflow

---

## 2. Locked technology stack

### Core

| Area | Choice | Notes |
|------|--------|-------|
| Language | **TypeScript** | Strict mode |
| Runtime | **Node.js 22 LTS** | No Python at this stage |
| Monorepo | **pnpm workspaces** | `packages/*`, `apps/*` |
| CLI | **Commander** | Same commands UI invokes |
| Validation | **Zod** | YAML/JSON contracts |
| Logging | **Pino** | Per-project `logs/` |
| Env | **dotenv** | Port keys/models from `serf-to-script/.env` |
| Prompt templates | **Handlebars** (`.hbs`) | `prompts/` + optional project overrides |

### Desktop UI

| Area | Choice | Notes |
|------|--------|-------|
| Shell | **Electron** | Node in main process; no Tauri sidecars |
| Frontend | **Svelte** | No React in UI |
| Build | **Vite** | Svelte in renderer; electron-vite or equivalent |
| Styling | **Tailwind** or minimal CSS | TBD at scaffold |

### AI providers (adapters)

Port pattern from `serf-to-script` providers; unified interface in `@ecpe/llm`:

- **OpenAI** (required)
- **Anthropic / Claude** (required)
- **Gemini** (optional)
- **Grok (xAI)** (optional, future)
- **Perplexity** (optional, future)

Provider and model **selectable per pipeline stage** in UI or `video.yaml`. Production Engine **must not** depend on any LLM.

### Production renderers (deterministic, no AI)

| Renderer | Implementation | Output |
|----------|----------------|--------|
| Mermaid | `@mermaid-js/mermaid-cli` or programmatic mermaid | SVG |
| Excalidraw | Excalidraw export API + snapshot | SVG/PNG |
| Browser | **Playwright** | PNG |
| Code | **Shiki** + sharp/resvg | SVG/PNG |
| Terminal | Custom HTML terminal mock + Playwright | PNG/SVG |
| UI cards | HTML/CSS templates + Playwright | SVG/PNG |
| Illustration | **Leonardo API** (HTTP) | PNG |
| Motion | **Motion Canvas** | MP4 |

**Not used:** Remotion (React), MCP servers for renderers, cloud backend for MVP.

### Render execution model

- **No separate render server**
- `@ecpe/production-engine` reads `production-plan.json`, dispatches to renderer plugins
- Each renderer: `render(params, outputPath) → { ok, paths, error? }`
- Scene failure → log + continue remaining scenes
- Heavy work (Playwright, Motion Canvas) in **worker threads** or **child processes** from Electron **main process**

### Video / composition

- **DaVinci Resolve** — manual final edit
- Future: FCPXML / EDL export from `edit-manifest.json` (post-MVP)

---

## 3. Repository layout (target)

```
ecpe/
├── docs/
│   ├── 000_SYSTEM_ARCHITECTURE.md    # copy or link from author
│   └── IMPLEMENTATION_PLAN.md        # this file
├── apps/
│   └── desktop/                      # Electron + Svelte
│       ├── electron/                 # main process, IPC, orchestrator bridge
│       └── src/                      # Svelte UI
├── packages/
│   ├── core/                         # orchestrator, pipeline stages, project FS
│   ├── llm/                          # provider adapters (.env)
│   ├── prompts/                      # load Handlebars, stage registry
│   ├── schemas/                      # Zod schemas (yaml, plan, manifest)
│   ├── segmentation/               # final-script → narration-segments.json
│   ├── production-engine/            # plan executor, renderer registry
│   └── renderers/
│       ├── mermaid/
│       ├── browser/
│       ├── code/
│       ├── terminal/
│       ├── ui-cards/
│       ├── illustration/
│       └── motion-canvas/
├── prompts/                          # default system + user templates (global)
│   ├── research/
│   ├── technical-review/
│   ├── script-writer/
│   ├── educational-review/
│   ├── youtube-editor/
│   └── visual-designer/
├── templates/                        # channel.yaml, video.yaml samples
├── .env.example                      # from serf-to-script keys + ECPE vars
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Per-project directory (runtime artifact)

User-selected path, e.g. `~/Videos/ECPE/projects/my-mcp-video/`:

```
<project-slug>/
├── channel.yaml
├── video.yaml
├── prompts/                    # optional overrides (UI-editable)
├── research.md
├── technical-review.md
├── script.md
├── educational-review.md
├── final-script.md
├── narration-segments.json     # timing ↔ text (§5.1)
├── production-plan.json
├── edit-manifest.json          # montage table (§5.3)
├── assets/
│   ├── diagrams/
│   ├── browser/
│   ├── code/
│   ├── terminal/
│   ├── ui-cards/
│   ├── illustrations/
│   └── motion/
├── logs/
│   └── run-<timestamp>.jsonl
└── .ecpe/
    └── state.json              # current stage, last revision notes, run id
```

**Regenerate rule:** writing a new artifact **overwrites** the canonical file. Optional single backup: previous version → `logs/archive/<stage>-<timestamp>.md` (config flag, default off).

---

## 5. File contracts (implementation-critical)

### 5.1 `narration-segments.json`

Generated after `final-script.md` (deterministic step, not LLM).

- Split script into logical narration segments (headings + paragraphs)
- Estimate duration: `word_count / WPM` from `video.yaml` (default 150 WPM)
- Fields per segment: `id`, `order`, `heading`, `text`, `word_count`, `estimated_duration_sec`, `start_sec`, `end_sec`, `start_timecode`, `end_timecode`

**Post-MVP:** re-segment from imported audio/SRT for exact timings.

### 5.2 `production-plan.json`

AI (Visual Production Designer) output. Each scene **must** reference segment(s):

```json
{
  "version": 1,
  "scenes": [
    {
      "scene_id": "scene-008",
      "segment_ids": ["seg-008"],
      "narration_excerpt": "verbatim quote from segment",
      "start_timecode": "05:42",
      "end_timecode": "06:00",
      "duration_sec": 18,
      "purpose": "Explain how MCP connects models with tools.",
      "visual": "architecture_diagram",
      "renderer": "mermaid",
      "insert_hint": "Full-screen B-roll during MCP hub explanation",
      "data": { }
    }
  ]
}
```

Production Engine reads **only** this file (never raw script).

### 5.3 `edit-manifest.json`

Generated by Production Engine after render pass:

- Flat list for UI montage view and CSV export
- Columns: `timecode_in`, `timecode_out`, `duration_sec`, `segment_ids`, `narration_excerpt`, `asset_path`, `renderer`, `visual`, `status`, `insert_hint`

---

## 6. Orchestrator & stages

### 6.1 Knowledge Pipeline stages

| Stage ID | Input files | Output | LLM |
|----------|-------------|--------|-----|
| `research` | channel.yaml, video.yaml | research.md | yes |
| `technical-review` | channel.yaml, video.yaml, research.md | technical-review.md | yes |
| `script-writer` | research.md, technical-review.md, yamls | script.md | yes |
| `educational-review` | channel.yaml, video.yaml, script.md | educational-review.md | yes |
| `youtube-editor` | channel.yaml, video.yaml, script.md, educational-review.md | final-script.md | yes |
| `segment` | final-script.md | narration-segments.json | no |

Each LLM stage API:

```ts
runStage(stageId, {
  projectPath,
  provider?,      // override
  model?,
  revisionNotes?, // user “fix this” text → appended to user prompt
})
```

### 6.2 Production Pipeline stages

| Stage ID | Input | Output | LLM |
|----------|-------|--------|-----|
| `visual-plan` | final-script.md, narration-segments.json | production-plan.json | yes |
| `render-assets` | production-plan.json | assets/*, edit-manifest.json | no |
| `render-scene` | production-plan.json + scene_id | single asset | no |

**Revision flows:**

- **Visual plan:** revision notes → regenerate plan (overwrite)
- **Single scene:** edit scene JSON in UI or revision to Visual Designer for one scene → re-run `render-scene` only

### 6.3 Composite commands (CLI + UI buttons)

- `run knowledge` — stages research → youtube-editor → segment
- `run production` — visual-plan → render-assets
- `run all` — knowledge then production
- `run <stageId>` — single stage with dependency check

---

## 7. Electron + Svelte architecture

```
┌─────────────────────────────────────────────────────────┐
│  Svelte UI (renderer)                                    │
│  - project picker, stage list, markdown preview          │
│  - revision textarea, regenerate, run all                  │
│  - script↔assets timeline, edit manifest table           │
└───────────────────────┬─────────────────────────────────┘
                        │ IPC (contextBridge)
┌───────────────────────▼─────────────────────────────────┐
│  Electron main                                           │
│  - @ecpe/core orchestrator                               │
│  - fs access, folder picker                              │
│  - spawn render workers / Motion Canvas / Playwright     │
│  - progress events → UI                                  │
└─────────────────────────────────────────────────────────┘
```

**IPC channels (minimum):**

- `project:create`, `project:open`, `project:list`
- `pipeline:run`, `pipeline:cancel`
- `stage:getArtifact`, `stage:saveArtifact` (manual edit before next stage)
- `prompts:get`, `prompts:save` (global + project override)
- `settings:get`, `settings:save` (default projects root, WPM, providers)
- `events:progress` (stage name, percent, log line)

**Security:** `contextIsolation: true`, no `nodeIntegration` in renderer.

---

## 8. Prompt system

### 8.1 File layout

```
prompts/<stage>/system.md       # role (author-provided content imported at Phase 2)
prompts/<stage>/user.hbs        # Handlebars user template
```

Variables: `channel`, `video`, prior artifact bodies (or paths), `revisionNotes`.

### 8.2 Resolution order

1. `<project>/prompts/<stage>/` if exists
2. Global `prompts/<stage>/`
3. Hard error if missing (no silent fallback)

### 8.3 UI

- Tree of stages → edit system + user template
- Preview rendered prompt for current project
- “Reset to default” copies global → project override delete

**Phase 2 deliverable:** import author’s existing prompt files for all 6 LLM stages.

---

## 9. Port from serf-to-script

| Asset | Action |
|-------|--------|
| `.env` / `.env.example` | Copy keys, models, base URLs; map to `@ecpe/llm` |
| Provider HTTP patterns | Rewrite in TS (OpenAI-compatible + Anthropic Messages + Gemini generateContent) |
| `tools/check_connections.ts` | Equivalent health check CLI |
| Prompts / pipelines | **Do not port** — ECPE has different stages and file contracts |
| PySide6 UI | **Do not port** |

---

## 10. Implementation phases

Phases are sequential; each ends with testable acceptance criteria.

### Phase 0 — Scaffold & tooling (≈1–2 days)

**Tasks:**

- [ ] Init pnpm monorepo under `youtube-automation/ecpe/`
- [ ] TypeScript project references, ESLint, Prettier
- [ ] `@ecpe/schemas`: Zod for channel.yaml, video.yaml
- [ ] `@ecpe/core`: ProjectPaths, create/open project, write/read artifacts
- [ ] `.env.example` + `@ecpe/llm` stub (one provider working)
- [ ] CLI skeleton: `ecpe project init`, `ecpe project info`

**Acceptance:** `pnpm ecpe project init --name test --dir ~/tmp/ecpe-test` creates folder tree from §4.

---

### Phase 1 — LLM layer & prompt loader (≈2–3 days)

**Tasks:**

- [ ] Implement OpenAI + Anthropic adapters (fetch, errors, timeouts)
- [ ] Optional Gemini adapter
- [ ] `@ecpe/prompts`: load system.md + render user.hbs
- [ ] `runStage` skeleton with revision notes appended to user prompt
- [ ] `ecpe llm check` — ping configured providers
- [ ] Copy `.env` from serf-to-script (manual step documented in README)

**Acceptance:** CLI can call one stage with dummy prompt files and write output markdown.

---

### Phase 2 — Knowledge Pipeline (≈4–5 days)

**Tasks:**

- [ ] Import author prompts into `prompts/*` (6 stages including visual-designer prep only if needed later)
- [ ] Implement all 5 knowledge stages + dependency checks
- [ ] `ecpe run research`, …, `ecpe run knowledge`
- [ ] Regenerate overwrites artifact; optional archive to logs/
- [ ] `@ecpe/segmentation`: final-script → narration-segments.json

**Acceptance:** End-to-end CLI produces `final-script.md` + `narration-segments.json` from sample yamls.

---

### Phase 3 — Production plan & engine MVP (≈4–5 days)

**Tasks:**

- [ ] Visual Designer stage → production-plan.json (Zod validated)
- [ ] Renderer interface + registry in `@ecpe/production-engine`
- [ ] Implement **Mermaid** + **Code (Shiki)** renderers first
- [ ] `render-assets` with per-scene error isolation
- [ ] Generate `edit-manifest.json`

**Acceptance:** CLI `ecpe run production` produces SVG/PNG assets + manifest from a fixture plan.

---

### Phase 4 — Electron + Svelte UI MVP (≈5–7 days)

**Tasks:**

- [ ] Electron app shell, IPC bridge
- [ ] **New project** screen: name, output dir picker, default root in settings
- [ ] **Pipeline** screen: stage list, status, Run / Run all / Regenerate + revision field
- [ ] Markdown preview for current artifact
- [ ] **Montage** screen: script segments ↔ assets table, timecodes, open file in OS
- [ ] Progress log panel (subscribe to `events:progress`)

**Acceptance:** Full knowledge + production (Mermaid + Code only) runnable from UI without CLI.

---

### Phase 5 — Additional renderers (≈5–8 days, parallelizable)

**Tasks:**

- [ ] Browser (Playwright) — document `playwright install chromium` in setup
- [ ] Terminal mock renderer
- [ ] UI cards (HTML templates)
- [ ] Excalidraw renderer
- [ ] Illustration (Leonardo)
- [ ] Motion Canvas renderer + 1–2 sample scene templates

**Acceptance:** production-plan.json can reference each renderer; failures logged per scene.

---

### Phase 6 — Polish & montage export (≈2–3 days)

**Tasks:**

- [ ] Export `edit-manifest.csv`
- [ ] Highlight segment in script when selecting manifest row
- [ ] Manual edit production-plan scene in UI → re-render scene
- [ ] README: install, .env, first video workflow
- [ ] Copy `000_SYSTEM_ARCHITECTURE.md` into `docs/` if not already

**Acceptance:** Creator can open CSV alongside Resolve with timecodes and asset paths.

---

### Post-MVP backlog (not in v1 scope)

- Re-segment from recorded audio / SRT
- FCPXML or EDL export
- Per-stage model routing in UI (beyond yaml)
- Project templates library
- Batch queue (“run overnight”)
- Grok / Perplexity adapters

---

## 11. UI screens (MVP wireframe map)

| Screen | Purpose |
|--------|---------|
| **Home / Projects** | Recent projects, New project (name + dir), Open folder |
| **Project dashboard** | Stage checklist (✓/pending/failed), Run all, Run knowledge, Run production |
| **Stage detail** | Artifact preview, revision notes, Regenerate, Approve → unlock next (step mode) |
| **Prompts** | Edit global + project prompts per stage |
| **Montage** | Split: final script with segment highlights + manifest table + asset preview |
| **Settings** | Default projects path, WPM, API keys status, provider defaults |

---

## 12. Risk register

| Risk | Mitigation |
|------|------------|
| Playwright/Chromium size in Electron app | Document dev setup; optional download on first use |
| Motion Canvas render time | Scene queue, progress UI, render single scene |
| LLM output not valid JSON (visual plan) | Zod + retry once with “fix JSON” prompt; show raw in UI on failure |
| WPM timing inaccurate vs real voice | Label as estimate; post-MVP audio sync |
| Angular-level complexity avoided | Svelte keeps UI thin; logic in `@ecpe/core` |

---

## 13. Definition of done (MVP)

ECPE MVP is complete when:

1. User creates project with **custom output folder** from UI
2. User can **Run all** knowledge → get `final-script.md` + segments
3. User can **stop after any stage**, add revision notes, **regenerate**, continue
4. User can **Run production** → assets + `edit-manifest.json` with timecodes tied to script excerpts
5. User can **regenerate single scene** without full pipeline
6. At least **Mermaid + Code + Browser** renderers work
7. **No React** anywhere in repo; Motion Canvas used for motion (at least one template)
8. All artifacts live in **one self-contained project folder**

---

## 14. Next action

When approved:

1. Execute **Phase 0** scaffold in `youtube-automation/ecpe/`
2. Copy `.env.example` from serf-to-script and extend for ECPE
3. Author drops prompt files into `prompts/` during Phase 2

**Do not start Phase 0 until explicit “begin scaffold” from project owner.**

---

*Last updated: planning session — stack locked: Electron + Svelte, Motion Canvas, TypeScript/Node, file-based pipelines, edit manifest for Resolve.*
