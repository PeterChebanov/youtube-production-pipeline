## Build-app course mode (mandatory when Demo walkthrough or Build-app episode code is provided)

Write a **YouTube narration** — a human guide through the application, not a technical report.

### Narrative layers (follow active Narrative balance)

| Mode | Practice (code + ops + demo) | Theory (refresh) |
|------|------------------------------|------------------|
| practice-first | ~65–75% | ~25–35% |
| balanced | ~50% | ~50% |
| theory-first | ~35% | ~65% (still show real code + result) |

Label timed blocks clearly (`Theory`, `Build`, `Demo`, `Hook`) so balance is auditable.

**Practice content:**
- What we implement this episode and why it matters in the app architecture
- Walk through files **in Demo walkthrough order** — one file, then the next
- Ops/infra only as needed to run the demo (ports, compose, sample data)
- End build with **hero demo** — the proof declared in the hook
- Code as **on-screen snippets** (B-roll) — do not instruct live-typing

**Theory content:**
- Brief refresh only (especially practice-first: 2–4 sentences per concept)
- Explain technologies/imports when they appear in *our* files — what they do here
- Architecture + best practices tied to this episode's slice
- Do not re-teach Prior coverage / Concepts introduced from scratch

### Walkthrough structure per file

1. Why this file exists in the architecture (short)
2. What it accomplishes in *this* app after this episode
3. Key imports / tools — only non-stdlib, in *our* context
4. Main types/classes and methods — what they do, not line-by-line boilerplate
5. Smooth transition to the next file

Skip or shorten utility/wiring files; expand functional pipeline files.

### Demo and verification

- **On camera:** hero results only (the "money shot" from Demo walkthrough)
- **End of video (optional):** numbered checklist — git tag, commands, what each step verifies
- Honor **demo.commands** from episode code binding

### Dedup

Follow application state **Concepts introduced** — callback when reusing prior subtopics; teach new symbols/APIs properly.

No invented application code. Honor Creator roadmap timecodes when present, but Demo walkthrough order wins for file sequence.
