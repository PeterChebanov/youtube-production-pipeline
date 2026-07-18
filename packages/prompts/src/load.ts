import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { enrichWordBudgetContext } from './word-budget.js';
import { buildNarrativeBalanceAppendix } from './narrative-balance.js';
import {
  estimateApplicationStateTokens,
  prepareApplicationStateForPrompt,
} from './application-state.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GLOBAL_PROMPTS_ROOT = path.join(REPO_ROOT, 'prompts');

export interface PromptContext {
  channel?: Record<string, unknown>;
  video?: Record<string, unknown>;
  /** Creator-provided planning doc (roadmap, block outline, prep notes). */
  sourceBrief?: string;
  /** Markdown table injected when sourceBrief contains `[M:SS–M:SS]` blocks. */
  wordBudgetTable?: string;
  /** Formatted narration blocks table (v2 segmentation) for visual-designer. */
  blocksSummary?: string;
  /** Per-block scene/hold limits table for visual-designer validation hints. */
  planLimitsTable?: string;
  /** Sum of per-block narration word targets. */
  totalNarrationWords?: number;
  artifacts?: Record<string, string>;
  /** Rolling application context for build-along courses */
  applicationState?: string;
  courseName?: string;
  episodeNumber?: number;
  revisionNotes?: string;
  /** Production plan JSON for episode-wrap stage */
  productionPlan?: string;
  /** Build-app: formatted episode code binding from episode-code.json */
  episodeCodeAppendix?: string;
  /** Build-app: demo walkthrough + stage focus from episode-authoring.yaml */
  episodeAuthoringAppendix?: string;
  /** Build-app: resolved repo line anchors for visual-designer */
  codeMapAppendix?: string;
  /** When true, append build-app overlay prompts for this stage */
  buildsApplication?: boolean;
  /** Course-level assumed prior knowledge from other channel content */
  priorCoverage?: string;
  /** ISO date YYYY-MM-DD — injected automatically in buildPrompts. */
  currentDate?: string;
  currentYear?: number;
  previousYear?: number;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePromptDir(
  stageId: string,
  projectPath?: string,
): Promise<string> {
  if (projectPath) {
    const projectDir = path.join(path.resolve(projectPath), 'prompts', stageId);
    if (await exists(path.join(projectDir, 'system.md'))) {
      return projectDir;
    }
  }

  const globalDir = path.join(GLOBAL_PROMPTS_ROOT, stageId);
  if (await exists(path.join(globalDir, 'system.md'))) {
    return globalDir;
  }

  const hint = projectPath
    ? `<project>/prompts/${stageId}/ or prompts/${stageId}/`
    : `prompts/${stageId}/`;
  throw new Error(`Missing prompts for stage "${stageId}". Expected ${hint} with system.md and user.hbs`);
}

export async function loadSystemPrompt(stageId: string, projectPath?: string): Promise<string> {
  const dir = await resolvePromptDir(stageId, projectPath);
  return readFile(path.join(dir, 'system.md'), 'utf8');
}

export async function renderUserPrompt(
  stageId: string,
  context: PromptContext,
  projectPath?: string,
): Promise<string> {
  const dir = await resolvePromptDir(stageId, projectPath);
  const templateRaw = await readFile(path.join(dir, 'user.hbs'), 'utf8');
  const template = Handlebars.compile(templateRaw, { noEscape: true });
  return template(context).trim();
}

export async function loadBuildAppOverlay(stageId: string): Promise<string | undefined> {
  const overlayPath = path.join(GLOBAL_PROMPTS_ROOT, 'build-app', stageId, 'overlay.md');
  if (!(await exists(overlayPath))) return undefined;
  return readFile(overlayPath, 'utf8');
}

export async function buildPrompts(
  stageId: string,
  context: PromptContext,
  projectPath?: string,
): Promise<{ system: string; user: string }> {
  enrichDateContext(context);
  enrichWordBudgetContext(context);
  let system = await loadSystemPrompt(stageId, projectPath);
  if (context.buildsApplication) {
    const overlay = await loadBuildAppOverlay(stageId);
    if (overlay?.trim()) {
      system += `\n\n---\n${overlay.trim()}`;
    }
  }
  let user = await renderUserPrompt(stageId, context, projectPath);

  if (context.revisionNotes?.trim()) {
    user += `\n\n---\nRevision notes from the creator:\n${context.revisionNotes.trim()}`;
  }

  if (context.applicationState?.trim()) {
    const header = context.courseName
      ? `Application state (${context.courseName}${context.episodeNumber ? ` · before episode ${context.episodeNumber}` : ''})`
      : 'Application state (course context)';
    const prepared = prepareApplicationStateForPrompt(context.applicationState, stageId);
    const injectNote =
      prepared.meta.compacted && prepared.meta.originalChars > prepared.meta.injectedChars
        ? `\n\n_Injected snapshot: ~${estimateApplicationStateTokens(prepared.meta.injectedChars)} tokens (full file ~${estimateApplicationStateTokens(prepared.meta.originalChars)} tokens). Concepts + project tree preserved._`
        : '';
    user += `\n\n---\n## ${header}\n\nRolling digest from prior episodes. **Dedup rule:** avoid repeating the **same subtopic / function / pattern** already in **Concepts introduced** (e.g. do not re-teach chunking if EP01 covered it). **Reusing a stack is fine** — LangChain and other tools may appear every episode. **Explain anything new** in this episode that is not yet in Concepts introduced. Brief callbacks when reusing prior work are enough.${injectNote}\n\n${prepared.text}`;
  }

  if (context.episodeCodeAppendix?.trim()) {
    user += `\n\n---\n${context.episodeCodeAppendix.trim()}`;
  }

  if (context.episodeAuthoringAppendix?.trim()) {
    user += `\n\n---\n${context.episodeAuthoringAppendix.trim()}`;
  }

  if (context.codeMapAppendix?.trim()) {
    user += `\n\n---\n${context.codeMapAppendix.trim()}`;
  }

  const narrativeAppendix = buildNarrativeBalanceAppendix(context.video, context.priorCoverage, {
    buildsApplication: !!context.buildsApplication,
  });
  if (narrativeAppendix) {
    user += `\n\n---\n${narrativeAppendix}`;
  }

  user = appendDateContextFooter(user, context);

  return { system, user };
}

function enrichDateContext(context: PromptContext): void {
  if (context.currentDate && context.currentYear) return;
  const now = new Date();
  const year = now.getFullYear();
  context.currentDate = now.toISOString().slice(0, 10);
  context.currentYear = year;
  context.previousYear = year - 1;
}

function appendDateContextFooter(user: string, context: PromptContext): string {
  const y = context.currentYear!;
  const py = context.previousYear!;
  return `${user}

---
## Current date context
Today is **${context.currentDate}**.
- Prefer facts, product versions, and company case studies from **${y}** or **${py}**.
- Do **not** present 2024-or-older stats as current without an explicit year label (e.g. "In 2024, Klarna reported…").
- Actively look for fresher examples before falling back to older ones.
- Historical examples (any era) are fine when labeled as history, not as "today's state of the industry".`;
}
