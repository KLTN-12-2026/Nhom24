import { env } from '../../config/env.js';
import { AI_REASON, aiError, unavailable, parseJsonText, postJson } from './http.js';

// Chỉ cài generateJson; embedding lấy từ Gemini (xem llmProvider.js)
export async function generateJson({ system, prompt, temperature = 0.1, model = env.LLM_MODEL, maxOutputTokens = 8192 }) {
  if (!env.LLM_API_KEY) throw unavailable(AI_REASON.CONFIG);
  const data = await postJson('https://api.openai.com/v1/chat/completions', {
    headers: { Authorization: `Bearer ${env.LLM_API_KEY}` },
    timeoutMs: env.LLM_TIMEOUT_MS,
    body: {
      model,
      temperature,
      max_completion_tokens: maxOutputTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    },
  });
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw aiError('AI_PARSE_FAILED', 'Kết quả AI bị cắt giữa chừng', { retryable: true });
  }
  return parseJsonText(choice?.message?.content);
}
