# Frame QA & Animation Research

**Date:** 2026-07-14  
**Context:** Production Fix Plan — unified validation to stop fix-one-break-another regressions  
**Reference standard:** UI Cards (do not change)

---

## 1. Why fixes regress across renderers

| Root cause | Effect |
|------------|--------|
| **UI Cards = preventive layout** | CSS grid + fixed frame; no Playwright QA needed |
| **Other renderers = partial post-render QA** | `runLayoutQA` checks fill/center/overflow but not viewport clip, title zone, overlap hard-fail |
| **Different safe areas** | Frame 1720px + 56px padding vs motion canvas 1760px vs mermaid 1860×1000 |
| **PNG vs MP4 parity** | Excalidraw PNG iterates scale; MP4 uses first candidate only |
| **Three timing models** | stamp-index (excalidraw/ui-cards), graph-steps (mermaid), inline CSS delays (motion) |
| **Icon rail pattern copied 3×** | excalidraw split-icons, motion sparse-rail, mermaid icon-rail — each breaks bbox independently |
| **QA never fails on clip** | ep01 passes 23/23 while screenshots show cutoff |

**Conclusion:** Need one **frame contract** + **per-renderer profiles** + **hard checks** with retry, not more per-renderer patches.

---

## 2. Safe zone & composition (1920×1080)

Industry practice for 16:9 presentation / broadcast:

| Rule | Value | Source |
|------|-------|--------|
| **Action safe** | ~90% of frame (5–10% inset) | TV safe title guides |
| **Our frame padding** | 40px top/bottom, 56px left/right | `BRAND_FRAME_CSS` |
| **Content max width** | 1720px centered | `.frame-inner` |
| **Effective safe rect** | 56, 48, 1864, 1032 (L/T/R/B) | frame padding + 8px breathing room |
| **Fill target** | ~70% of safe area | PRODUCTION_FIX_PLAN principle #2 |
| **Center band** | 38–62% on X and Y | existing `layout-validate` |

Elements must satisfy **both**:

1. `bbox ⊆ safeRect` — nothing clipped by viewport  
2. `fillRatio ≥ 0.7` within safe area — not tiny blocks in empty frame  
3. `center ∈ [0.38, 0.62]²` — visual balance (main content only, exclude decorative rails)  
4. `title ∩ blocks = ∅` — title band reserved  
5. `minGap ≥ 12px` between blocks — no crushing

---

## 3. Animation best practices (web research synthesis)

Educational motion graphics literature (Mayer, explainer studios, infographic video guides) converges on:

### Principles

1. **Temporal contiguity** — visual change within **500ms–1s** of narration cue  
2. **Segmenting** — max **5–7 elements** per screen; reveal sequentially  
3. **Coherence** — animate only when motion clarifies; no decorative noise  
4. **Reading order** — reveal in the order a human would explain (orient → reveal → emphasize → hold)  
5. **Hold after reveal** — ~0.5–1s pause so viewer can read  
6. **Consistent motion vocabulary** — same easing, same step rhythm across scenes  

### Recommended ECPE animation set (6 core + 1 fallback)

| ID | Use case | ECPE mapping |
|----|----------|--------------|
| **fade-up** | Default block entrance | `reveal-fade-up` (existing) |
| **slide-left** | Horizontal flow, next step | `reveal-slide-left` |
| **pop-in** | Icons, emphasis nodes | `reveal-pop-in` / motion `popIn` |
| **scale-in** | Central / hero block | `reveal-scale-in` |
| **draw-on** | Arrows, edges, connectors | mermaid edge reveal, pipe-arrow fadeUp |
| **stagger-hold** | Multi-block sequence | stamp delay `0.85s` step + `1.8s` tail |
| **fade-stack** (fallback) | Overflow / many blocks | compact layout, no motion path |

### Reveal sequence contract (all MP4 renderers)

```
Beat 0: title (optional)
Beat 1: block₁ (+ icon inside block)
Beat 2: arrow₁→₂ (or edge₁→₂)
Beat 3: block₂ (+ icon)
...
Hold: 1.5–2s on final frame
```

**Never:** all arrows/edges first, then blocks. **Never:** icon rail visible at frame 0.

---

## 4. Unified validation — `frame-qa.ts`

### API

```typescript
runFrameQA(page, profile: 'excalidraw' | 'motion' | 'mermaid')
formatFrameQAIssues(result)
hasHardFailures(result)  // viewport clip, title overlap, no blocks
```

### Profiles

| Profile | Main content selectors | Ignored for bbox |
|---------|------------------------|------------------|
| excalidraw | `.sketch-box`, `.flow-card`, `.chain-arrow`, `h1.title` | — |
| motion | `.pipe-node`, `.pipe-arrow`, `.title` | — |
| mermaid | `.mermaid svg` | removed icon rail |

### Hard-fail checks (new)

- `viewport_clip` — any content element outside safe rect  
- `title_overlap` — title bbox intersects any block  
- `block_overlap` — pairwise block intersection (pad 4px)  
- `no_blocks` — zero visible blocks  

### Soft checks (retry with layout-compact / scale-down)

- `fill_low` — area < 70% of safe zone  
- `off_center` — centroid outside band  

### Integration pattern

```
setContent → pre-fit (scale/tier/layout) → runFrameQA
  → if hard fail: retry (next scale / compact / alternate layout)
  → if soft fail: apply layout-compact once, re-check
  → record MP4
```

Excalidraw MP4 must use **same scale iteration loop** as PNG.

---

## 5. Implementation mapping (this session)

| # | Fix | Files |
|---|-----|-------|
| 1 | Reveal order | `animations/stamp.ts`, `excalidraw/html.ts`, `motion/templates.ts`, `mermaid/reveal.ts` |
| 2 | Frame-fit QA | `shared/frame-qa.ts`, `shared/layout-validate.ts`, all `*/render.ts` |
| 3 | Arrow direction | `motion/templates.ts` |
| 4 | Title safe zone | `excalidraw/html.ts` |
| 5 | Layout auto-pick | `excalidraw/html.ts`, `excalidraw/layout.ts` |
| 6 | Mermaid icons + TD | `themes/palettes.ts`, `mermaid/render.ts`, `mermaid/reveal.ts` |
| 7 | Motion consistency | `motion/templates.ts` (`pickMotionTemplate`, sparse-panel → in-block icons) |

---

## 6. What we deliberately do NOT change

- **UI Cards** — reference implementation, no edits  
- **Excalidraw white theme** — awaiting user reference  
- **Visual plan regeneration** — render-only fixes on existing ep01 plan
