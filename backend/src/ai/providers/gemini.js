import { env } from '../../config/env.js';
import { AI_REASON, aiError, unavailable, l2Normalize, parseJsonText, postJson } from './http.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const EMBED_BATCH = 50; // batchEmbedContents cho tối đa 100 mục/lần
const EMBED_MAX_CHARS = 8000;

// Provider khác gemini thì LLM_API_KEY không dùng được cho Gemini, cần EMBEDDING_API_KEY
const embedKey = () => env.EMBEDDING_API_KEY || (env.LLM_PROVIDER === 'gemini' ? env.LLM_API_KEY : '');

function requireKey(key) {
  if (!key) throw unavailable(AI_REASON.CONFIG);
  return key;
}

export async function generateJson({ system, prompt, temperature = 0.1, model = env.LLM_MODEL, maxOutputTokens = 8192 }) {
  const data = await postJson(`${BASE}/${model}:generateContent`, {
    headers: { 'x-goog-api-key': requireKey(env.LLM_API_KEY) },
    timeoutMs: env.LLM_TIMEOUT_MS,
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', maxOutputTokens },
    },
  });

  const candidate = data?.candidates?.[0];
  if (!candidate) {
    throw aiError('AI_PARSE_FAILED', 'AI không trả về kết quả', { retryable: true });
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw aiError('AI_PARSE_FAILED', 'Kết quả AI bị cắt giữa chừng', { retryable: true });
  }
  const text = (candidate.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  return parseJsonText(text);
}

export async function embed(texts) {
  const key = requireKey(embedKey());
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const chunk = texts.slice(i, i + EMBED_BATCH);
    const data = await postJson(`${BASE}/${env.EMBEDDING_MODEL}:batchEmbedContents`, {
      headers: { 'x-goog-api-key': key },
      timeoutMs: env.LLM_TIMEOUT_MS,
      body: {
        requests: chunk.map((t) => ({
          model: `models/${env.EMBEDDING_MODEL}`,
          content: { parts: [{ text: String(t).slice(0, EMBED_MAX_CHARS) }] },
          taskType: 'SEMANTIC_SIMILARITY',
          outputDimensionality: env.EMBEDDING_DIM,
        })),
      },
    });
    const embeddings = data?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== chunk.length) {
      throw unavailable(AI_REASON.OVERLOADED, { retryable: true });
    }
    for (const e of embeddings) {
      if (!Array.isArray(e?.values) || e.values.length !== env.EMBEDDING_DIM) {
        throw unavailable(AI_REASON.CONFIG); // sai EMBEDDING_DIM
      }
      out.push(l2Normalize(e.values)); // bản khác 3072 chiều phải tự chuẩn hóa
    }
  }
  return out;
}
