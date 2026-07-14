# ECPE — Implementation Plan

**Version:** 2.0  
**Status:** MVP scaffold + Knowledge pipeline **shipped**; **Production pipeline tuning in progress**  
**Architecture reference:** [`000_SYSTEM_ARCHITECTURE.md`](000_SYSTEM_ARCHITECTURE.md) (product architecture, block-first montage, renderers)

This document is the **implementation plan**: technologies, repo layout, UI behavior, file contracts, and phased delivery.

---

## 1. Product summary

**Educational Content Production Engine (ECPE)** is a **local-first desktop assistant** for one creator producing educational YouTube videos about AI, software engineering, and modern technology.

### What the system does

- Runs a **Knowledge Pipeline** (5 AI agents + segment) from video idea → **`final-script.md`**
- Runs a **Production Pipeline** (Visual Designer AI → deterministic engine) from final script → **production-ready assets** + montage manifest
- Produces a **self-contained project folder** (scripts, plan, assets, logs, edit manifest for DaVinci Resolve)
- Does **not** record narration, does **not** auto-edit the final video, does **not** replace creative decisions

### What the creator still does

- Chooses topic and context (`source-brief.md` / creator roadmap)
- Records A-roll narration
- Final edit in **DaVinci Resolve** — sync B-roll to voice using **block + sentence span**, not model timecodes

### Verification phases

| Phase | What we validate | Status |
|-------|------------------|--------|
| **1 — Knowledge** | `final-script.md` ready for recording | ✅ Mature |
| **2 — Production** | Semantic blocks, assets, montage without holes | 🔄 **Current focus** |

### UI operating modes

| Mode | Behavior |
|------|----------|
| **Autopilot** | Run knowledge → `final-script.md`; run production → assets + manifest |
| **Step-by-step** | One stage at a time; preview artifact; revision notes → regenerate (overwrite) |
| **Drill-down** | After full run, revise any stage/scene and regenerate from that point |

### Critical montage requirement (updated)

The creator must always know:

- **Which block** of `final-script.md`
- **Which sentences** within that block (start → end)
- **Which asset file** covers that text
- **In what order** assets play within the block

Enforced via **`narration-segments.json`** (blocks + sentences), **`production-plan.json`** (scenes with spans), and **`edit-manifest.json`**.

**Not** enforced via model timecodes — creator reading pace varies; montage is **block-first**, WPM is for **visual density** only.

### Project output location

- Default projects root: `~/Desktop/ECPE/projects` (configurable in settings)
- UI: project name/slug + custom output directory
- Entire package lives in one folder for Resolve workflow

---

## 2. Locked technology stack

### Core

| Area | Choice | Notes |
|------|--------|-------|
| Language | **TypeScript** | Strict mode |
| Runtime | **Node.js 22 LTS** | |
| Monorepo | **pnpm workspaces** | `packages/*`, `apps/*` |
| CLI | **Commander** | Same commands UI invokes |
| Validation | **Zod** | YAML/JSON contracts |
| Logging | **Pino** | Per-project `logs/` |
| Env | **dotenv** | API keys in `.env` |
| Prompt templates | **Handlebars** (`.hbs`) | `prompts/` + optional project overrides |

### Desktop UI

| Area | Choice | Notes |
|------|--------|-------|
| Shell | **Electron** | Node in main process |
| Frontend | **Svelte** | No React in UI |
| Build | **Vite** | electron-vite |

### AI providers (`@ecpe/llm`)

- **Anthropic / Claude** (default)
- **OpenAI** (required)
- **Gemini** (optional)
- Grok / Perplexity — future

Production Engine **must not** depend on any LLM.

### Production renderers

| Renderer | Target | Cost | Implementation status |
|----------|--------|------|------------------------|
| Mermaid | SVG | Free | ✅ Implemented |
| Excalidraw | PNG/SVG | Free | ❌ **To implement** — structured spec → Playwright |
| Code | HTML (Shiki) | Free | ✅ Implemented |
| Terminal | HTML mock | Free | ✅ Implemented |
| Browser | PNG (Playwright) | Free | ✅ Implemented |
| UI cards | HTML | Free | ✅ Implemented |
| Motion | **MP4** (Motion Canvas) | Free (local) | ⚠️ Stub — JSON spec only; **priority** |
| Illustration | PNG (Leonardo) | Paid API | ⚠️ Stub — `.prompt.txt`; **API deferred** (manual use) |

**Not used:** Remotion, MCP servers for renderers, cloud render backend.

**Connector rule:** Every renderer in the target set must output a **real asset file**. No stubs at production v2 done.

### Render execution model

- `@ecpe/production-engine` reads `production-plan.json`, dispatches to renderer plugins
- Each renderer: `render(scene, outputPath) → { ok, paths, error? }`
- Scene failure → log + continue
- Playwright / Motion Canvas from Electron main (workers optional)

### Video / composition

- **DaVinci Resolve** — manual final edit
- Future: FCPXML / EDL export

---

## 3. Repository layout

```
video-production-pipeline/
├── docs/
│   ├── 000_SYSTEM_ARCHITECTURE.md
│   └── IMPLEMENTATION_PLAN.md
├── apps/
│   ├── cli/
│   └── desktop/                 # Electron + Svelte
├── packages/
│   ├── core/
│   ├── llm/
│   ├── prompts/
│   ├── schemas/
│   ├── segmentation/
│   └── production-engine/
├── prompts/                     # research … visual-designer
├── templates/
└── package.json
```

---

## 4. Per-project directory

```
<project-slug>/
├── channel.yaml
├── video.yaml
├── source-brief.md              # creator roadmap
├── research.md … final-script.md
├── narration-segments.json      # blocks + sentences (§5.1)
├── production-plan.json
├── edit-manifest.json
├── assets/
│   ├── diagrams/                # mermaid SVG
│   ├── excalidraw/              # (target) PNG/SVG
│   ├── browser/ code/ terminal/ ui-cards/
│   ├── illustrations/           # .prompt.txt until Leonardo API
│   └── motion/                  # MP4 (target)
├── logs/
└── .ecpe/state.json
```

**Regenerate rule:** new artifact **overwrites** canonical file. Optional archive: `logs/archive/` (config flag).

---

## 5. File contracts (implementation-critical)

### 5.1 `narration-segments.json`

**Target (`version: 2`)** — deterministic, not LLM:

- Split `final-script.md` by `## [...]` headings → **semantic blocks**
- Per block: `block_id`, `title`, `on_screen_action`, `narration_text`, `sentences[]` (indexed), `word_count`, `estimated_duration_sec`
- WPM from `video.yaml` — default **133** — for **density estimation only**

**Current code (`version: 1`):** paragraph-level segments with cumulative timecodes — **to be replaced** in production tuning Phase A.

**Post-MVP:** re-segment from recorded audio / SRT for exact timings.

### 5.2 `production-plan.json`

**Target (`version: 2`)** — Visual Designer LLM output:

```json
{
  "version": 2,
  "scenes": [
    {
      "scene_id": "scene-003-a",
      "block_id": "block-003",
      "scene_order": 1,
      "sentence_start": 1,
      "sentence_end": 4,
      "narration_span": "verbatim text for sentences 1–4",
      "estimated_hold_sec": 75,
      "purpose": "why this visual exists",
      "visual": "pipeline_step_ingestion",
      "renderer": "motion",
      "insert_hint": "Full-screen step 1 of animated architecture",
      "data": {}
    }
  ]
}
```

**Current code (`version: 1`):** `segment_ids`, `start_timecode`, `end_timecode` — **to be migrated**.

Rules:

- Long blocks need **multiple scenes** (typically 4–8 for ~4 min blocks)
- LLM may subdivide block internally for visuals; `block_id` stays parent reference
- `engagement_tactic` field reserved — **not enforced** until after baseline test

### 5.3 `edit-manifest.json`

Block-centric flat list for Montage + CSV export:

- `block_id`, `scene_order`, `sentence_start`, `sentence_end`, `narration_span`
- `asset_path`, `renderer`, `visual`, `status`, `insert_hint`, `estimated_hold_sec`
- Optional `timecode_in` / `timecode_out` with `estimated: true` — not primary montage key

### 5.4 `auditProductionPlan()` (to implement)

After visual-plan, before write:

- Block with zero scenes → error
- Sentence coverage < 80% per block → warning
- Unknown `block_id` / invalid sentence range → error
- LLM JSON fail → Zod + one retry with "fix JSON" prompt

---

## 6. Orchestrator & stages

### 6.1 Knowledge Pipeline — ✅ shipped

| Stage ID | Output | LLM |
|----------|--------|-----|
| `research` | research.md | yes |
| `technical-review` | technical-review.md | yes |
| `script-writer` | script.md | yes |
| `educational-review` | educational-review.md | yes |
| `youtube-editor` | final-script.md | yes |
| `segment` | narration-segments.json | no |

Post-processing on script stages: word budget audit, contraction expansion, progress logs.

### 6.2 Production Pipeline — 🔄 tuning

| Stage ID | Output | LLM |
|----------|--------|-----|
| `visual-plan` | production-plan.json | yes |
| `render-assets` | assets/*, edit-manifest.json | no |
| `render-scene` | single asset | no |

### 6.3 Composite commands

- `run knowledge` — research → youtube-editor → segment
- `run production` — visual-plan → render-assets
- `run <stageId>` — single stage

---

## 7. Production tuning phases (current work)

Phases 0–4 (scaffold, knowledge, basic production, desktop UI) are **largely complete**. New work:

### Phase A — Baseline test (no new rules)

**Goal:** Observe model behavior on real script without engagement taxonomy.

- [ ] Run `segment` → `visual-plan` → `render-assets` on `test-4` (`final-script.md`)
- [ ] Document failures: holes, static holds, wrong renderer choices, stub outputs
- [ ] Input for engagement taxonomy and prompt tuning

**Acceptance:** Baseline report with concrete gaps listed.

---

### Phase B — Block segmentation + schemas

**Goal:** Semantic blocks with indexed sentences.

- [ ] Rewrite `@ecpe/segmentation`: split by `## [...]`, extract narration + on-screen action
- [ ] `narration-segments.json` v2 schema + Zod
- [ ] Update visual-plan inputs (structured block table in `user.hbs`)
- [ ] Migrate `production-plan.json` and `edit-manifest.json` to v2 fields

**Acceptance:** `test-4` segments show 7 blocks with sentence indices; no paragraph micro-segments.

---

### Phase C — Visual plan quality

**Goal:** Coverage without holes; sentence spans.

- [ ] Expand `visual-designer/system.md`: density rules, comprehension + retention, renderer selection (mermaid vs excalidraw)
- [ ] Implement `auditProductionPlan()` + progress warnings
- [ ] JSON retry on Zod failure
- [ ] **Do not** enforce engagement taxonomy yet (baseline comparison)

**Acceptance:** Every block in `test-4` has scenes; spans cover ≥ 80% sentences; audit logs warnings.

---

### Phase D — Real renderers (no stubs)

**Goal:** All connectors output real files.

| Task | Priority |
|------|----------|
| Motion Canvas → MP4 (`step-reveal-diagram`) | **P0** |
| Motion demos: `title-card`, `kinetic-text` | P1 |
| Excalidraw: spec + layout templates + validator + Playwright PNG | **P0** |
| Mermaid → motion step_reveal bridge | P1 |
| `ecpe render check` smoke test all renderers | P1 |
| Leonardo API | **Deferred** — manual `.prompt.txt` OK for now |
| `render-scene` manifest merge (not full overwrite) | P2 |

**Excalidraw automation model:** LLM → structured spec (layout template + elements) → validator → deterministic builder → Playwright → PNG. Design system in `channel.yaml`. See architecture doc §5.2.

**Acceptance:** `ecpe run production` on `test-4` produces real SVG/PNG/MP4 — no `.prompt.txt`-only or JSON-spec-only for motion/excalidraw.

---

### Phase E — Montage UI (block-centric)

**Goal:** Creator sees block → assets → sentence spans.

- [ ] Montage: expandable blocks, scene list, `narration_span` visible
- [ ] Highlight uncovered sentences
- [ ] `render-scene` from UI
- [ ] Export CSV with block/sentence columns

**Acceptance:** Creator can montage `test-4` in Resolve using manifest alone.

---

### Phase F — Engagement taxonomy (after baseline)

**Goal:** Closed enum + rules — only after Phase A baseline reviewed.

- [ ] Define tactic enum (`step_reveal`, `comparison`, `code_focus`, …)
- [ ] Add to visual-designer prompt + `engagement_tactic` field
- [ ] Audit anti-rules (e.g. long static hold)

**Acceptance:** Tactics appear in plan; audit enforces coverage + tactic rules.

---

## 8. Completed phases (historical)

### Phase 0 — Scaffold ✅

### Phase 1 — LLM + prompts ✅

### Phase 2 — Knowledge Pipeline ✅

### Phase 3 — Production MVP ✅ (partial — stubs remain)

### Phase 4 — Desktop UI MVP ✅

### Phase 5 — Additional renderers ⚠️ partial

- ✅ browser, terminal, ui-cards
- ❌ excalidraw
- ⚠️ motion stub
- ⚠️ illustration stub (Leonardo deferred)

### Phase 6 — Polish ⚠️ partial

- ✅ `edit-manifest.csv` export
- ⚠️ block-centric Montage
- ⚠️ production-plan scene editor in UI

---

## 9. Prompt system

```
prompts/<stage>/system.md
prompts/<stage>/user.hbs
```

Resolution: `<project>/prompts/<stage>/` → global `prompts/<stage>/`.

Knowledge prompts: **mature**. Visual-designer: **under active tuning** (Phase C).

---

## 10. Risk register

| Risk | Mitigation |
|------|------------|
| WPM estimate ≠ real voice | Montage by block/sentence, not timecode; `estimated_hold_sec` is hint only |
| Holes in montage | `auditProductionPlan()` coverage check |
| Excalidraw quality first try | Layout templates + design system + validator + retry |
| Motion Canvas render time | Single-scene render, progress UI |
| LLM invalid JSON (visual plan) | Zod + retry; show raw in UI on failure |
| Leonardo cost | Deferred; manual workflow |
| Engagement too rigid too early | Baseline test (Phase A) before taxonomy (Phase F) |

---

## 11. Definition of done

### Knowledge (done)

1. ✅ `final-script.md` from roadmap + research, word budget, spoken voice
2. ✅ Step-by-step + revision notes
3. ✅ Desktop + CLI

### Production v2 (target)

1. Semantic blocks with indexed sentences in `narration-segments.json`
2. Visual plan with sentence spans and multi-asset long blocks
3. Audit prevents coverage holes
4. **Real files** from mermaid, excalidraw, code, terminal, browser, ui-cards, **motion MP4**
5. Block-centric Montage UI
6. Creator montages in Resolve without hand-filling missing B-roll
7. Leonardo API and engagement taxonomy — deferred until after baseline

---

## 12. Post-MVP backlog

- Leonardo API connector
- Engagement taxonomy enforcement (after baseline)
- Re-segment from audio / SRT
- FCPXML / EDL export
- Per-stage model routing in UI
- Animated Excalidraw native export
- Grok / Perplexity adapters

---

## 13. Next action

1. **Phase A:** Baseline production run on `~/Desktop/ECPE/projects/test-4/final-script.md`
2. **Phase B:** Block segmentation (foundation for everything else)
3. **Phase D:** Motion MP4 + Excalidraw automation in parallel with Phase C

See [`000_SYSTEM_ARCHITECTURE.md`](000_SYSTEM_ARCHITECTURE.md) for design principles and file contract details.

---

*Last updated: production tuning v2 — block-first montage, sentence anchoring, WPM 133 for density only, Excalidraw full automation, Motion priority, Leonardo deferred, engagement taxonomy after baseline.*
