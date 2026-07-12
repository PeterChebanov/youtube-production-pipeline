import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GLOBAL_PROMPTS_ROOT = path.join(REPO_ROOT, 'prompts');

export interface PromptContext {
  channel?: Record<string, unknown>;
  video?: Record<string, unknown>;
  artifacts?: Record<string, string>;
  revisionNotes?: string;
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

export async function buildPrompts(
  stageId: string,
  context: PromptContext,
  projectPath?: string,
): Promise<{ system: string; user: string }> {
  const system = await loadSystemPrompt(stageId, projectPath);
  let user = await renderUserPrompt(stageId, context, projectPath);

  if (context.revisionNotes?.trim()) {
    user += `\n\n---\nRevision notes from the creator:\n${context.revisionNotes.trim()}`;
  }

  return { system, user };
}
