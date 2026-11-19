import { env } from '../../config/env.js';
import { AI_REASON, aiError, unavailable, parseJsonText, postJson } from './http.js';

// Chỉ cài generateJson; embedding lấy từ Gemini (xem llmProvider.js)
export async function generateJson({ system, prompt, model = env.LLM_MODEL, maxOutputTokens = 8192 }) {
  if (!env.LLM_API_KEY) throw unavailable(AI_REASON.CONFIG);
  // Không gửi temperature: các model Claude mới có thể từ chối tham số lấy mẫu
  const data = await postJson('https://api.anthropic.com/v1/messages', {
    headers: { 'x-api-key': env.LLM_API_KEY, 'anthropic-version': '2023-06-01' },
    timeoutMs: env.LLM_TIMEOUT_MS,
    body: {
      model,
      max_tokens: maxOutputTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    },
  });
  if (data?.stop_reason === 'max_tokens') {
    throw aiError('AI_PARSE_FAILED', 'Kết quả AI bị cắt giữa chừng', { retryable: true });
  }
  const text = (data?.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return parseJsonText(text);
}
