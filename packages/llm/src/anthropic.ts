import { getLlmConfig } from './config.js';

function anthropicMessagesUrl(): string {
  const cfg = getLlmConfig();
  let base = cfg.anthropicBaseUrl.replace(/\/$/, '');
  while (base.endsWith('/v1')) {
    base = base.slice(0, -3).replace(/\/$/, '');
  }
  return `${base}/v1/messages`;
}

function formatAnthropicError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; type?: string } };
    const msg = parsed.error?.message?.trim();
    if (msg) return `Anthropic API error: ${msg}`;
  } catch {
    // use raw body below
  }
  return `Anthropic HTTP ${status}: ${body}`;
}

export async function anthropicComplete(options: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutS?: number;
}): Promise<string> {
  const cfg = getLlmConfig();
  if (!cfg.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const url = anthropicMessagesUrl();
  const controller = new AbortController();
  const timeoutSec = options.timeoutS ?? cfg.httpTimeoutS;
  const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': cfg.anthropicApiKey,
        'anthropic-version': cfg.anthropicVersion,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model ?? cfg.anthropicModel,
        max_tokens: options.maxTokens ?? cfg.anthropicMaxTokens,
        system: options.system,
        messages: [{ role: 'user', content: options.user }],
        temperature: options.temperature ?? cfg.anthropicTemperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 800);
      throw new Error(formatAnthropicError(response.status, body));
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const texts = (data.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text!);

    const out = texts.join('\n').trim();
    if (!out) {
      const types = (data.content ?? []).map((b) => b.type);
      throw new Error(`Anthropic returned no text (block types: ${types.join(', ')})`);
    }
    return out;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `Anthropic request timed out after ${timeoutSec}s. Increase HTTP_TIMEOUT_S or VISUAL_PLAN_TIMEOUT_S in .env, or run the stage alone.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
