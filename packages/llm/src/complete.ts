import type { CompleteOptions, LlmProviderId } from './config.js';
import { DEFAULT_LLM_PROVIDER } from './config.js';
import { anthropicComplete } from './anthropic.js';
import { geminiComplete } from './gemini.js';
import { openaiComplete } from './openai.js';

export async function complete(options: CompleteOptions): Promise<string> {
  const provider: LlmProviderId = options.provider ?? DEFAULT_LLM_PROVIDER;

  switch (provider) {
    case 'openai':
      return openaiComplete(options);
    case 'anthropic':
      return anthropicComplete(options);
    case 'gemini':
      return geminiComplete(options);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

async function ping(check: () => Promise<string>): Promise<{ ok: boolean; message: string }> {
  try {
    const text = await check();
    return { ok: text.toLowerCase().includes('ok'), message: text || 'empty response' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkOpenAI(): Promise<{ ok: boolean; message: string }> {
  return ping(() =>
    openaiComplete({
      system: 'Reply with the single word ok.',
      user: 'ok',
      maxTokens: 16,
      temperature: 0,
    }),
  );
}

export async function checkAnthropic(): Promise<{ ok: boolean; message: string }> {
  return ping(() =>
    anthropicComplete({
      system: 'Reply with the single word ok.',
      user: 'ok',
      maxTokens: 32,
      temperature: 0,
    }),
  );
}

export async function checkGemini(): Promise<{ ok: boolean; message: string }> {
  return ping(() =>
    geminiComplete({
      system: 'Reply with the single word ok.',
      user: 'ok',
      maxTokens: 16,
      temperature: 0,
    }),
  );
}
