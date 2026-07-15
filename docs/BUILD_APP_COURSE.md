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
| Course-level plans | — | **None** — no master-plan, no course-wide code map |

---

## Creating a build-app course

1. Create course → check **Build-app course**.
2. Optionally create ep01 with roadmap + JSON (if you paste a first-episode narrative, JSON is required).
3. For each new episode: title + **`episode-code.json`** (paste or Import JSON). Optional `source-brief.md` for that episode's narrative.

Repo URL and local path live **inside each** `episode-code.json`:

```json
{
  "version": 1,
  "repo_url": "https://github.com/you/app",
  "repo_path": "/Users/you/app",
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

---

## Workflow

```
External planning (optional) → build & test app in Git
        → create build-app course in VPP
        → per episode: source-brief + episode-code.json
        → run pipeline → record → DaVinci Resolve
```

Planning the app and course structure is **outside** this app. See [`COURSE_AUTHORING_GUIDE.md`](../COURSE_AUTHORING_GUIDE.md).
