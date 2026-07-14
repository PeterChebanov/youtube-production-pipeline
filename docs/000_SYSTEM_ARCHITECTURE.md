# ECPE — System Architecture

**Version:** 2.0  
**Status:** Knowledge pipeline mature; **production pipeline in active tuning**  
**Companion doc:** [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) (repo layout, phases, file contracts)

---

## 1. Product overview

**Educational Content Production Engine (ECPE)** is a **local-first desktop assistant** for one creator producing educational YouTube videos about AI, software engineering, and modern technology.

### What the system does

| Pipeline | Input | Output |
|----------|-------|--------|
| **Knowledge** (5 LLM agents + segment) | Topic, roadmap, channel context | `final-script.md` — narration-ready script |
| **Production** (Visual Designer + render engine) | `final-script.md` | Production-ready assets + `edit-manifest.json` |

The system produces a **self-contained project folder** (scripts, plan, assets, logs, montage manifest). It does **not** record narration, auto-edit the final video, or replace creative decisions.

### What the creator still does

- Chooses topic and context (creator roadmap / `source-brief.md`)
- Records A-roll narration
- Final edit in **DaVinci Resolve** using block → asset mapping from the manifest

### Verification phases

| Phase | Focus | Status |
|-------|-------|--------|
| **1 — Knowledge** | `final-script.md` quality (roadmap honored, research, spoken voice) | **Mature** — tuned prompts, word budget, post-processing |
| **2 — Production** | Semantic blocks, visual plan, real assets, montage without holes | **In progress** — current priority |

---

## 2. Core design principles (production)

These principles override older timecode-centric assumptions in early drafts.

### 2.1 Block-first montage, not time-first

- The **primary montage unit** is a **semantic block** of narration text (one `## [...] Title` section in `final-script.md`).
- **Roadmap / script timecodes** (e.g. `[4:00–8:00]`) define **block boundaries only** — they are **not** used for Resolve sync.
- The creator's real reading pace varies (e.g. model estimates 4:00, actual 4:20–4:30). **Montage follows text blocks and sentence spans**, not model timing.

### 2.2 WPM is for visual density only

- Default: **133 words per minute** (`video.yaml`).
- Used to **estimate** how long a block takes to read → how many assets are needed so the edit does not have **holes**.
- Formula: `estimated_duration_sec = (word_count / 133) × 60`.
- A few seconds of estimate error is acceptable. **Uncovered narration text is not.**

### 2.3 Sentence-level asset anchoring

Within a long block, each asset must declare **which sentences** it covers:

- `block_id` — parent semantic block
- `scene_order` — sequence inside the block (1, 2, 3…)
- `sentence_start`, `sentence_end` — 1-based indices within the block's narration
- `narration_span` — verbatim text from sentence start through sentence end

The creator must see: *"Asset 2 attaches to sentences 4–7 of Block Architecture."*

### 2.4 Engagement over static holds

Every B-roll must serve two goals:

1. **Comprehension** — help the viewer understand the narration block
2. **Retention** — hold attention through design quality and dynamism

Rules:

- **No long static holds** unless the visual is inherently dynamic (step-by-step pipeline reveal, animated diagram).
- A single asset may run **up to ~90 seconds** when it uses a **dynamic infographic** (elements appear sequentially, arrows/flows build, viewer stays engaged).
- The goal is **not** to flash a new image every 5–10 seconds; it is to **never lose the viewer**.
- Long blocks (e.g. ~4 min ≈ 530 words) need **multiple assets** (typically 4–8), not one image for the whole block.

### 2.5 Anti-hole coverage

After visual planning, the system audits:

- Blocks with **zero** assets → error
- Blocks where asset spans cover **< 80%** of narration sentences → warning
- Long blocks with too few scenes → warning

Manual "resurrection" of missing B-roll in Resolve is the worst failure mode.

### 2.6 Full automation, no routine hand-work

- Every production connector must produce a **real file** (PNG, SVG, MP4, HTML) — **no stubs** in the target state.
- Occasional manual fix in Excalidraw or Resolve is acceptable; **routine** hand-editing defeats the purpose.
- **No MCP servers** for renderers — Node/npm libraries + HTTP APIs only.

---

## 3. Knowledge pipeline

### 3.1 Stages

| Stage | Output | LLM |
|-------|--------|-----|
| `research` | `research.md` | yes |
| `technical-review` | `technical-review.md` | yes |
| `script-writer` | `script.md` | yes |
| `educational-review` | `educational-review.md` | yes |
| `youtube-editor` | `final-script.md` | yes |
| `segment` | `narration-segments.json` | no |

### 3.2 Maturity

Knowledge pipeline is **production-ready** for the creator workflow:

- Rich agent prompts (voice, ethics, anti-repetition, word budget)
- Post-processing: contraction expansion, word-count audit, progress reporting
- `source-brief.md` (creator roadmap) flows into every LLM stage
- Primary deliverable: **`final-script.md`** for camera recording

### 3.3 `final-script.md` structure

Each block contains:

- `## [optional time range] Title` — structural header (time range is **not** montage authority)
- **On-screen Action** — hint for A-roll vs B-roll
- **Narration** — spoken text ("What I Should Say" style)

---

## 4. Production pipeline

### 4.1 Stages

| Stage | Input | Output | LLM |
|-------|-------|--------|-----|
| `visual-plan` | `final-script.md`, `narration-segments.json`, yamls | `production-plan.json` | yes |
| `render-assets` | `production-plan.json` | `assets/*`, `edit-manifest.json` | no |
| `render-scene` | `production-plan.json` + `scene_id` | single asset (+ manifest update) | no |

### 4.2 Segmentation (`segment` stage)

**Target behavior** (replacing paragraph-level splitting):

1. Split `final-script.md` by `## [...]` headings → **semantic blocks**
2. Per block, extract:
   - `block_id` (e.g. `block-003`)
   - `title`, `on_screen_action`
   - `narration_text` (spoken content only)
   - `sentences[]` — indexed list for asset anchoring
   - `word_count`, `estimated_duration_sec` (WPM 133)
3. LLM may **subdivide a block internally** when planning visuals (multiple scenes per block), but the parent `block_id` stays visible in the manifest.

**Not used for montage:** cumulative `start_timecode` / `end_timecode` from model estimates (optional `estimated_*` fields may remain for reference only).

### 4.3 Visual Designer (LLM)

For each block (and sentence spans within it), the Visual Designer:

- Chooses **how many** assets and **which renderer**
- Assigns **sentence ranges** per scene
- Writes `purpose`, `insert_hint`, and renderer-specific `data`
- May subdivide long blocks into sub-themes **only** for visual planning

**Engagement tactics:** A formal taxonomy (step_reveal, comparison, code_focus, etc.) is **planned** but **not enforced yet**. Current work runs a **baseline** — let the model plan without a closed enum, observe failures, then codify rules.

### 4.4 Production engine (deterministic)

- Reads **only** `production-plan.json` (never raw script)
- Dispatches to renderer plugins: `render(scene, outputPath) → { ok, paths, error? }`
- Scene failure → log + continue remaining scenes
- Heavy work (Playwright, Motion Canvas) from Electron main process (workers optional)

---

## 5. Renderers

### 5.1 Inventory

| Renderer | Target output | Automation | Cost | Current code status |
|----------|---------------|------------|------|---------------------|
| **mermaid** | SVG | Full | Free (mermaid-cli + Chromium) | ✅ Working |
| **excalidraw** | PNG / SVG | **Full** (structured spec → render) | Free (npm + Playwright) | ❌ Not implemented |
| **code** | HTML (Shiki) | Full | Free | ✅ Working |
| **terminal** | HTML mock | Full | Free | ✅ Working |
| **browser** | PNG (Playwright) | Full | Free | ✅ Working |
| **ui-cards** | HTML | Full | Free | ✅ Working |
| **motion** | **MP4** (Motion Canvas) | Full | Free (local render) | ⚠️ Stub → JSON spec only |
| **illustration** | PNG | Manual / API later | Paid (Leonardo) | ⚠️ Stub → `.prompt.txt`; **API deferred** |

**Leonardo:** Creator has a subscription but will use **manually** for now. API connector is post-MVP unless needed.

**Mermaid vs Excalidraw:** Model chooses based on tone, strictness, and visual needs. Both must be available; neither replaces the other.

**Motion priority:** Animated diagrams (`step_reveal`) are highest priority. Title cards and kinetic text get **demo templates** for evaluation. Animated builds of Mermaid/Excalidraw diagrams via Motion Canvas are desired.

### 5.2 Excalidraw — full automation model

Manual Excalidraw editing every time is **not** acceptable. Target pipeline:

```
LLM → structured diagram spec (layout template + elements + labels)
    → validator (orphan nodes, label presence, element limits, design rules)
    → deterministic .excalidraw builder
    → Playwright snapshot → PNG/SVG
    → (optional) Motion Canvas step_reveal → MP4
```

**Design system** (in `channel.yaml` or templates):

- Channel palette (limited colors)
- Max elements per diagram
- Required labels on boxes and arrows
- Layout templates: `pipeline_horizontal`, `hub_spoke`, `comparison_two_column`, `layered_stack`

The model fills a **template**, not free-form pixel art. Quality comes from constraints + validation + retry, not from hoping for a perfect first draw.

### 5.3 Motion Canvas

Priority templates:

| Template | Purpose |
|----------|---------|
| `step-reveal-diagram` | Pipeline / architecture built step-by-step (primary) |
| `title-card` | Block opener / chapter beat (demo) |
| `kinetic-text` | Emphasize key term or metric (demo) |

Mermaid and Excalidraw outputs can feed `step-reveal-diagram` for animated builds.

---

## 6. File contracts (production-critical)

### 6.1 `narration-segments.json` (target schema)

```json
{
  "version": 2,
  "words_per_minute": 133,
  "blocks": [
    {
      "block_id": "block-003",
      "order": 3,
      "title": "Architecture — Four Blocks and Where the Pain Lives",
      "on_screen_action": "Full-screen architecture diagram…",
      "narration_text": "First, ingestion. This is where…",
      "sentences": [
        { "index": 1, "text": "First, ingestion." },
        { "index": 2, "text": "This is where you take raw knowledge documents…" }
      ],
      "word_count": 412,
      "estimated_duration_sec": 186
    }
  ]
}
```

`version: 1` (paragraph segments with timecodes) exists in current code — migration to `version: 2` is part of production tuning.

### 6.2 `production-plan.json` (target scene shape)

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
      "narration_span": "First, ingestion. This is where you take…",
      "estimated_hold_sec": 75,
      "engagement_tactic": null,
      "purpose": "Introduce ingestion as first pipeline block",
      "visual": "pipeline_step_ingestion",
      "renderer": "motion",
      "insert_hint": "Full-screen step 1 of 4-step animated architecture",
      "data": {
        "template": "step-reveal-diagram",
        "layout": "pipeline_horizontal",
        "step": 1
      }
    }
  ]
}
```

`engagement_tactic` is optional until the taxonomy is enforced.

### 6.3 `edit-manifest.json` (block-centric)

Primary columns for Montage and Resolve workflow:

| Field | Role |
|-------|------|
| `block_id` | Parent semantic block |
| `scene_order` | Order within block |
| `sentence_start`, `sentence_end` | Text anchoring |
| `narration_span` | Verbatim covered text |
| `asset_path` | Relative path under `assets/` |
| `renderer`, `visual`, `status` | Render metadata |
| `estimated_hold_sec` | Suggested duration (not authoritative) |
| `insert_hint` | Editor note |

`timecode_in` / `timecode_out` may appear as **optional estimates** (`estimated: true`) — not the primary montage key.

---

## 7. Montage workflow (Resolve)

```
final-script.md
  → blocks with indexed sentences
  → production-plan (scenes with sentence spans)
  → rendered assets
  → edit-manifest (block → ordered assets → text span)
  → creator syncs in Resolve by reading narration while placing B-roll
```

The creator edits **by block and sentence span**, adjusting clip length to their actual voice. The system guarantees **coverage** (no holes), not **frame-perfect timing**.

---

## 8. Planned engagement taxonomy (not enforced yet)

After baseline testing, a closed enum with selection rules, for example:

| Tactic | When | Typical renderer |
|--------|------|------------------|
| `a_roll` | Talking head, no B-roll | — (insert_hint only) |
| `step_reveal` | Multi-step pipeline / process | motion |
| `architecture_map` | System diagram with focus | mermaid / excalidraw → motion |
| `comparison` | A vs B, before/after | excalidraw / ui-cards |
| `code_focus` | API, config, snippets | code + terminal |
| `screen_demo` | Repo, UI, Docker | browser |
| `data_highlight` | Key metric, case study number | motion (kinetic text) |
| `title_beat` | Block transition | motion (title card) |

Anti-rules (future): e.g. no `static_diagram` hold > 30s without `step_reveal` or motion.

---

## 9. Technology constraints

| Area | Choice |
|------|--------|
| Language | TypeScript (strict), Node.js 22+ |
| Desktop | Electron + Svelte (no React) |
| LLM | OpenAI, Anthropic (default), Gemini — via `@ecpe/llm` |
| Validation | Zod |
| Production engine | **No LLM** — deterministic renderers only |
| Connectors | npm packages + HTTP (Leonardo later); **no MCP** |
| Final edit | DaVinci Resolve |

---

## 10. Definition of done — production v2

Production tuning is complete when:

1. **Segmentation** splits `final-script.md` into semantic blocks with indexed sentences
2. **Visual plan** assigns multiple assets per long block with sentence spans
3. **Audit** warns on coverage holes before render
4. **All target renderers** output real files — mermaid, excalidraw, code, terminal, browser, ui-cards, **motion MP4** (no stubs)
5. **Montage UI** shows block → asset list → sentence span text
6. Creator can run production on a real video (e.g. `test-4`) and montage in Resolve **without hand-filling missing B-roll**

Leonardo API and engagement taxonomy enforcement are **explicitly deferred** after baseline evaluation.

---

*Last updated: production tuning planning — block-first montage, sentence anchoring, full Excalidraw automation, Motion priority, Leonardo deferred.*
