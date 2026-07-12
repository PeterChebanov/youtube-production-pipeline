import { getLlmConfig } from './config.js';

export async function geminiComplete(options: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const cfg = getLlmConfig();
  if (!cfg.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const model = options.model ?? cfg.geminiModel;
  const base = cfg.geminiBaseUrl.replace(/\/$/, '');
  const url = `${base}/models/${model}:generateContent?key=${cfg.geminiApiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.httpTimeoutS * 1000);

  try {
    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? 0.4,
    };
    if (options.maxTokens) {
      generationConfig.maxOutputTokens = options.maxTokens;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.system }] },
        contents: [{ role: 'user', parts: [{ text: options.user }] }],
        generationConfig,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 400);
      throw new Error(`Gemini HTTP ${response.status} for model ${model}: ${body}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text?: string }> } }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const out = parts
      .map((p) => p.text ?? '')
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!out) {
      throw new Error('Gemini returned no text');
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}
