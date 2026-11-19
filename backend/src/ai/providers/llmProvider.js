import { AI_LIMITS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import * as anthropic from './anthropic.js';
import * as gemini from './gemini.js';
import { getBudgetHook } from './budget.js';
import { MAX_RETRY_AFTER_MS, aiError } from './http.js';
import * as mock from './mock.js';
import * as openai from './openai.js';

const PROVIDERS = { gemini, anthropic, openai, mock };

// Tên nhà cung cấp lấy từ .env nên không đưa giá trị đó vào thông báo lỗi
function getProvider() {
  const provider = PROVIDERS[env.LLM_PROVIDER];
  if (!provider) {
    throw aiError('AI_UNAVAILABLE', 'LLM_PROVIDER không hợp lệ, chỉ hỗ trợ gemini, anthropic, openai, mock');
  }
  return provider;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const MAX_CONCURRENT_REQUESTS = 2;
const BACKOFF_BASE_MS = 1000;

/** Hàng đợi đơn giản: tối đa MAX_CONCURRENT_REQUESTS request chạy cùng lúc, còn lại xếp hàng theo thứ tự đến */
let active = 0;
const waiting = [];

async function limited(fn) {
  if (active >= MAX_CONCURRENT_REQUESTS) await new Promise((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next(); // chuyển nguyên suất cho người chờ tiếp theo
    else active--;
  }
}

/** Thời gian chờ trước lần thử lại thứ attempt+1: tôn trọng Retry-After/retryDelay (tối đa 20 giây), không thì backoff 1s, 2s... */
export function retryDelayMs(err, attempt) {
  if (Number.isFinite(err?.retryAfterMs)) return Math.min(err.retryAfterMs, MAX_RETRY_AFTER_MS);
  return BACKOFF_BASE_MS * 2 ** attempt;
}

async function withRetry(fn) {
  const maxAttempts = 1 + Math.max(0, env.LLM_MAX_RETRIES);
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await limited(fn); // nhả suất trong lúc chờ backoff để request khác được chạy
    } catch (err) {
      lastErr = err;
      if (!err?.retryable || attempt === maxAttempts - 1) break;
      const wait = retryDelayMs(err, attempt);
      if (!env.isTest) console.warn(`[ai] thử lại lần ${attempt + 1}/${maxAttempts - 1} sau ${wait}ms`);
      await sleep(env.isTest ? 0 : wait);
    }
  }
  throw lastErr;
}

const isOverloadOrQuota = (err) => err?.httpStatus === 429 || err?.httpStatus === 503;

/**
 * Ép LLM trả JSON. Tự thử lại tối đa LLM_MAX_RETRIES lần với lỗi tạm thời hoặc JSON hỏng, tối đa 2 request chạy cùng lúc.
 * Lỗi: AI_PARSE_FAILED (JSON sai sau retry) hoặc AI_UNAVAILABLE (API lỗi, timeout, thiếu khóa).
 * `jsonSchema` được nối vào system prompt để mọi nhà cung cấp dùng chung một cách.
 */
export async function generateJson({ system, prompt, jsonSchema, temperature = 0.1, tool }) {
  const provider = getProvider();
  const fullSystem = jsonSchema
    ? `${system}\n\nKết quả phải khớp JSON Schema sau:\n${JSON.stringify(jsonSchema)}`
    : system;
  // v1.23: trần đầu vào / đầu ra theo công cụ (CONTRACT 7.9). Kiểm tra trước cầu dao để lời gọi quá dài không tốn ngân sách.
  const maxChars = AI_LIMITS.PROMPT_MAX_CHARS[tool];
  if (maxChars && fullSystem.length + String(prompt ?? '').length > maxChars) {
    throw aiError('AI_PARSE_FAILED', 'Nội dung gửi cho AI quá dài');
  }
  const maxOutputTokens = AI_LIMITS.MAX_OUTPUT_TOKENS[tool] ?? AI_LIMITS.DEFAULT_MAX_OUTPUT_TOKENS;
  const call = (model) => () =>
    provider.generateJson({ system: fullSystem, prompt, jsonSchema, temperature, model, maxOutputTokens });

  const budget = getBudgetHook();
  const ticket = budget ? await budget.acquire(tool) : null; // ném AI_UNAVAILABLE (budget | disabled) khi bị chặn
  try {
    const out = await generateWithFallback(call);
    await budget?.settle(ticket, null);
    return out;
  } catch (err) {
    await budget?.settle(ticket, err?.reason ?? err?.details?.find?.((d) => d.field === 'reason')?.message ?? 'invalid_output');
    throw err;
  }
}

async function generateWithFallback(call) {
  try {
    return await withRetry(call(env.LLM_MODEL));
  } catch (err) {
    // Model chính vẫn 429/503 sau khi hết retry: thử đúng một lần với model dự phòng (nếu có cấu hình)
    const fallback = env.LLM_FALLBACK_MODEL;
    if (!fallback || fallback === env.LLM_MODEL || !isOverloadOrQuota(err)) throw err;
    if (!env.isTest) console.warn('[ai] model chính lỗi, chuyển sang model dự phòng');
    try {
      return await limited(call(fallback));
    } catch {
      throw err; // báo nguyên nhân của model chính, không để lỗi cấu hình của model phụ che mất
    }
  }
}

/**
 * Vector độ dài EMBEDDING_DIM, chuẩn hóa L2. Anthropic/OpenAI không có embedding nên dùng Gemini.
 * v1.24: đi qua cầu dao ngân sách như generateJson (một lượt cho mỗi lô); bị chặn thì ném AI_UNAVAILABLE (budget | disabled)
 * mà không gọi nhà cung cấp, nơi gọi tự rơi về cách tính không có phần ngữ nghĩa.
 */
export async function embed(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const impl = getProvider().embed ?? gemini.embed;
  const budget = getBudgetHook();
  const ticket = budget ? await budget.acquire('embedding') : null;
  try {
    const out = await withRetry(() => impl(texts));
    await budget?.settle(ticket, null);
    return out;
  } catch (err) {
    await budget?.settle(ticket, err?.reason ?? err?.details?.find?.((d) => d.field === 'reason')?.message ?? 'invalid_output');
    throw err;
  }
}
