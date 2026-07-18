## Build-app course mode (mandatory when Demo walkthrough or Build-app episode code is provided)

Write a **YouTube narration** — a human guide through the application, not a technical report.

### Narrative layers (follow active Narrative balance)

| Mode | Practice (code + ops + demo) | Theory (refresh) |
|------|------------------------------|------------------|
| practice-first | ~65–75% | ~25–35% |
| balanced | ~50% | ~50% |
| theory-first | ~35% | ~65% (still show real code + result) |

Use topic headers with kind labels (`Hook`, `Build`, `Demo`, `Recap`) — **no clock timecodes**.

**Canon spine for this episode:**
1. Hook — what we build + what success looks like on camera
2. Short topic recap only (budget = theory %)
3. File walkthrough in Demo walkthrough **skeleton** order
4. Hero demo that **shows how the result looks** (not only that a command exited 0)
5. Thin close (optional `## Recap`) — not a second lecture

**Practice content:**
- What we implement and why it matters in the app architecture
- Per important file: role → outcome → key imports/types/methods
- Ops/infra only as needed to run the demo
- Code as **on-screen snippets** (B-roll) — do not instruct live-typing

**Theory / Recap content (thin):**
- practice-first: **2–3 sentences per concept** — name it, why it matters here, move on
- **No formulas, rank arithmetic, or full algorithm walkthroughs** in Theory/Recap (e.g. no "1/(k+60)" derivations)
- Put mechanics (RRF math, model internals, SQL operators) **only in Build**, when the code is on screen
- Do not re-teach Prior coverage / Concepts introduced from scratch
- No multi-minute standalone Theory lecture block

### Explain once (mandatory)

Each mechanism (BM25, RRF, cross-encoder, schema field, …) gets **one** real explanation — at the highest-value place (usually the file that implements it).
- Theory/Recap may **name** it in one line; Build teaches it; Demo shows the result
- Forbidden: explain RRF (or any algorithm) in Theory, then explain it again in Build

### Closing Recap (mandatory if present)

`## Recap` / closing block = **3–5 sentences only**:
1. What we built (modules/endpoint)
2. What we showed on camera (the visible result)
3. One abstract bridge to later work (no "next video/episode")

Do **not** re-list BM25 → vector → RRF → rerank as a second lecture.

### Demo quality (mandatory)

Hero demo must make the implementation visible:
- If you stored chunks — show **chunk text / overlap / metadata**, not only `count(*)`
- If you return JSON — show the meaningful fields / rank changes
- Follow ★ money-shot items from the walkthrough skeleton

### Series language

Only abstract: "as the series continues", "when we add generation…".  
Never: "in the next video", "in the next episode", "video N", "episode N".

### Dedup

Follow **Concepts introduced** — callback when reusing prior subtopics; teach new symbols/APIs properly.

No invented application code. Demo walkthrough skeleton order wins for file sequence. Stay inside the episode length band.
