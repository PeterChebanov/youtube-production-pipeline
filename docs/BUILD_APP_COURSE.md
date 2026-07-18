# Build-app course mode

**Video Production Pipeline** (desktop app) supports three creation modes:

1. **Single video** — one folder, `source-brief.md`, normal pipeline.
2. **Regular course** — multiple episodes, shared `application-state.md`, illustrative code allowed.
3. **Build-app course** — checkbox `builds_application: true`; each episode requires **`episode-code.json`** with repo binding for **that video only**.

---

## Build-app vs regular

| | Regular course | Build-app course |
|---|----------------|------------------|
| Flag | `builds_application: false` | `builds_application: true` |
| Code in scripts | Illustrative OK | **Only** from real repo per `episode-code.json` |
| Per episode | `source-brief.md` (optional) | `source-brief.md` + **`episode-code.json` (required)** |
| App repo path | — | **`app_repo_path` in course.yaml** (once per course) |
| Narrative ratios | Ordinary narrative-balance prompts | Build-app ratios (practice-first ~65–75% walkthrough; theory-first still ~35% practice) |
| Course-level plans | — | **None** — no master-plan, no course-wide code map |

---

## Creating a build-app course

1. Create course → check **Build-app course**.
2. Set **Application repository (local path)** — mandatory; stored in `course.yaml` (`app_repo_path`) for all episodes.
3. Optionally set `default_narrative_balance` in `course.yaml` (`practice-first` recommended).
4. For each episode: title + **narrative balance** (written to `video.yaml` on create) + Demo walkthrough → auto `episode-code.json`. Optional `source-brief.md`.

Repo URL (optional, for viewers) and local path live in **course.yaml**. Per-episode JSON holds git checkpoint, demo, and `script_sources` only:

```json
{
  "version": 1,
  "title": "Ingestion pipeline",
  "git_checkpoint": "ep02",
  "has_code": true,
  "new_scope": ["ingestion/pipeline.py"],
  "script_sources": [{ "path": "ingestion/pipeline.py", "purpose": "Main demo" }],
  "demo": { "commands": ["python -m ingestion.cli ingest sample.md"], "summary": "Ingest doc" }
}
```

Template: [`templates/episode-code.json`](../templates/episode-code.json)

---

## Pipeline behavior

1. **Gate** — pipeline fails if `episode-code.json` is missing for the current episode.
2. **Prompt injection** — only **this episode's** JSON is formatted and appended (not the whole course).
3. **Repo files** — if `repo_path` is set, `script_sources` contents are injected (12k chars/file cap).
4. **Memory** — `application-state.md` and `prior-coverage.md` work as in regular courses.
5. **Balance soft-check** — after research/script, logs warn if Theory share exceeds the mode target (does not fail the run).
6. **Length band** — `target_length_minutes` → allowed spoken words ≈ (T−1)…(T+2) minutes; topic headers only (no `[M:SS]`). Demo walkthrough is compressed to a skeleton before prompt inject.

---

## Workflow

```
External planning (optional) → build & test app in Git
        → create build-app course in VPP
        → per episode: narrative balance + demo walkthrough (+ optional source-brief)
        → run pipeline → record → DaVinci Resolve
```

Planning the app and course structure is **outside** this app.
