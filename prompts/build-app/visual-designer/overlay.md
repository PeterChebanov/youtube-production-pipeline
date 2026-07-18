## Build-app course mode (mandatory when Code map or Demo walkthrough is provided)

Plan B-roll for a **real repository** — code scenes must use **repository anchors**, not invented snippets.

### Code scenes (mandatory rules)

1. For `renderer: "code"`, set:
   - `data.source_ref` — repo-relative path (e.g. `ingestion/chunker.py`)
   - `data.start_line`, `data.end_line` — from **Code map** appendix
   - `data.filename`, `data.language`, `data.caption`
   - **Do not** paste full `data.code` — leave empty; pipeline resolves from git before render
2. Match each code scene's `narration_span` to script sentences that discuss that file/section
3. Prefer **logical chunks** (imports block, class, function) over random 2-line fragments
4. If file ≤ ~80 lines, one scene may cover the full range from Code map
5. Long files → multiple scenes following Code map anchors in walkthrough order

### Terminal / browser

- Use **terminal** for demo commands and hero CLI/JSON output from Demo walkthrough verification
- Use **browser** for curl JSON responses when narration describes API results

### Priority

Layer 1 visuals: functional code + hero demo output.
Layer 2 visuals: architecture diagrams, brief infra mentions — shorter holds.

Rotate renderers; do not put an entire block in one motion scene when code walkthrough is narrated.
