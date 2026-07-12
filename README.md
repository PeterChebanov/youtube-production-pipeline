# Video Production Pipeline (ECPE)

Local-first desktop assistant for educational YouTube production: **Knowledge Pipeline** → `final-script.md` → **Production Pipeline** → assets + edit manifest.

## Stack (MVP)

- TypeScript, Node.js 22, pnpm workspaces
- Packages: `@ecpe/schemas`, `@ecpe/core`, `@ecpe/llm`, `@ecpe/prompts`, `@ecpe/segmentation`, `@ecpe/production-engine`, `@ecpe/cli`
- Desktop: **Electron + Svelte** (`apps/desktop`)

See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for the full roadmap.

## Setup

```bash
cd ~/video-production-pipeline
pnpm install
pnpm build
cp .env.example .env   # add API keys (or copy from serf-to-script)

# Optional: Mermaid diagrams need Chromium
cd packages/production-engine
pnpm exec puppeteer browsers install chrome-headless-shell

# Optional: Playwright browser screenshots
pnpm exec playwright install chromium
```

## Desktop app

```bash
pnpm dev:desktop    # Vite + Electron dev
pnpm desktop        # run built app (after pnpm build)
```

Screens: **Projects**, **Pipeline** (channel/video editor, run stages), **Montage** (segments ↔ manifest), **Settings**.

## CLI

```bash
# Create project
pnpm ecpe project init --name my-video --topic "What is MCP"

# Knowledge pipeline
pnpm ecpe run knowledge --project ~/Videos/ECPE/projects/my-video

# Production pipeline
pnpm ecpe run production --project ~/path/to/project

# Export Resolve montage table
pnpm ecpe export manifest-csv --project ~/path/to/project

# Check LLM providers
pnpm ecpe llm check
```

## Project folder layout

Each project contains `channel.yaml`, `video.yaml`, pipeline artifacts, `assets/*`, `logs/`, `.ecpe/state.json`, and after production `edit-manifest.json` (+ optional `edit-manifest.csv`).

## Renderers (production-engine)

| Renderer | Output |
|----------|--------|
| mermaid | SVG diagram |
| code | HTML (Shiki) |
| terminal | HTML mock |
| browser | PNG (Playwright) or HTML fallback |
| ui-cards | HTML cards |
| illustration | `.prompt.txt` for Leonardo |
| motion | JSON spec for Motion Canvas |

## First video workflow

1. Create project (UI or CLI)
2. Edit **channel.yaml** + **video.yaml** (audience, topic, notes)
3. **Run knowledge** → `final-script.md` + `narration-segments.json`
4. **Run production** → `production-plan.json` → assets + `edit-manifest.json`
5. Export **edit-manifest.csv** for DaVinci Resolve
6. Record A-roll, edit in Resolve using manifest timecodes + asset paths
