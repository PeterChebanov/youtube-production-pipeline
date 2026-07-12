import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loadDotenv({ path: path.join(REPO_ROOT, '.env') });
  loaded = true;
}

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') return fallback;
  return v;
}

export function getLlmConfig() {
  loadEnv();
  return {
    openaiApiKey: env('OPENAI_API_KEY'),
    openaiModel: env('OPENAI_MODEL', 'gpt-4o-mini')!,
    openaiBaseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1')!,
    anthropicApiKey: env('ANTHROPIC_API_KEY'),
    anthropicModel: env('ANTHROPIC_MODEL', 'claude-sonnet-4-5-20250929')!,
    anthropicBaseUrl: env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com')!,
    anthropicVersion: env('ANTHROPIC_VERSION', '2023-06-01')!,
    anthropicMaxTokens: Number(env('ANTHROPIC_MAX_TOKENS', '8192')),
    anthropicTemperature: Number(env('ANTHROPIC_TEMPERATURE', '0.4')),
    geminiApiKey: env('GEMINI_API_KEY'),
    geminiModel: env('GEMINI_MODEL', 'gemini-2.5-flash')!,
    geminiBaseUrl: env(
      'GEMINI_BASE_URL',
      'https://generativelanguage.googleapis.com/v1beta',
    )!,
    httpTimeoutS: Number(env('HTTP_TIMEOUT_S', '120')),
  };
}

export type LlmProviderId = 'openai' | 'anthropic' | 'gemini';

export interface CompleteOptions {
  provider?: LlmProviderId;
  model?: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}
