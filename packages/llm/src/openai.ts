import { getLlmConfig } from './config.js';

export async function openaiComplete(options: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const cfg = getLlmConfig();
  if (!cfg.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const url = `${cfg.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.httpTimeoutS * 1000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model ?? cfg.openaiModel,
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
        temperature: options.temperature ?? 0.4,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 400);
      throw new Error(`OpenAI HTTP ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content?.trim() ?? '';
  } finally {
    clearTimeout(timeout);
  }
}
