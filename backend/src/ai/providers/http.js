import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/** Phân loại AI_UNAVAILABLE (CONTRACT 7.5): hết hạn mức (429), quá tải (5xx/timeout/mạng), lỗi cấu hình (400/401/403/404...) */
export const AI_REASON = Object.freeze({ QUOTA: 'quota', OVERLOADED: 'overloaded', CONFIG: 'config' });

const REASON_MESSAGE = {
  [AI_REASON.QUOTA]: 'Hạn mức sử dụng AI đã hết, vui lòng thử lại sau ít phút',
  [AI_REASON.OVERLOADED]: 'Dịch vụ AI đang quá tải, vui lòng thử lại sau ít phút',
  [AI_REASON.CONFIG]: 'Dịch vụ AI chưa được cấu hình đúng, vui lòng liên hệ quản trị viên',
};

/**
 * Tạo lỗi AI đúng mã hợp đồng. `retryable` cho llmProvider biết có nên thử lại không.
 * `reason` (AI_REASON) gắn vào `details` để frontend/log phân biệt; `httpStatus`/`retryAfterMs` chỉ dùng nội bộ.
 * Thông điệp không bao giờ chứa API key, URL hay nội dung CV.
 */
export function aiError(code, message, { retryable = false, reason, httpStatus, retryAfterMs } = {}) {
  const err = new ApiError(code, message, reason ? [{ field: 'reason', message: reason }] : undefined);
  err.retryable = retryable;
  err.reason = reason;
  err.httpStatus = httpStatus;
  err.retryAfterMs = retryAfterMs;
  return err;
}

/** Lỗi AI_UNAVAILABLE theo nhóm nguyên nhân, message tiếng Việt cố định */
export const unavailable = (reason, opts = {}) => aiError('AI_UNAVAILABLE', REASON_MESSAGE[reason], { reason, ...opts });

export const MAX_RETRY_AFTER_MS = 20_000;

/** Retry-After: số giây hoặc ngày HTTP. Trả ms hoặc undefined */
function parseRetryAfterHeader(value) {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/** Gemini báo `error.details[].retryDelay` kiểu "7s" hoặc "7.5s" trong body lỗi; chỉ lấy đúng trường này, bỏ phần còn lại */
async function readRetryDelayFromBody(res) {
  try {
    const body = await res.json();
    const delay = (body?.error?.details ?? []).find((d) => typeof d?.retryDelay === 'string')?.retryDelay;
    const m = /^(\d+(?:\.\d+)?)s$/.exec(delay ?? '');
    return m ? Number(m[1]) * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Log gọn, chỉ mã HTTP và loại lỗi; không bao giờ ghi URL, header hay body */
export function logAiFailure({ httpStatus, reason, kind }) {
  if (env.isTest) return;
  console.warn(`[ai] lỗi gọi dịch vụ AI: http=${httpStatus ?? '-'} loại=${reason ?? '-'}${kind ? ` (${kind})` : ''}`);
}

/**
 * POST JSON có timeout. Phân loại: 429 -> quota, 5xx/timeout/mạng -> overloaded (đều thử lại được),
 * 4xx khác -> config (không thử lại). Không bao giờ đưa URL/key/body vào lỗi hay log.
 */
export async function postJson(url, { headers, body, timeoutMs }) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    logAiFailure({ reason: AI_REASON.OVERLOADED, kind: timedOut ? 'timeout' : 'network' });
    throw unavailable(AI_REASON.OVERLOADED, { retryable: true });
  }

  if (!res.ok) {
    const httpStatus = res.status;
    const reason =
      httpStatus === 429
        ? AI_REASON.QUOTA
        : httpStatus >= 500 || httpStatus === 408
          ? AI_REASON.OVERLOADED
          : AI_REASON.CONFIG;
    const retryable = reason !== AI_REASON.CONFIG;
    let retryAfterMs;
    if (httpStatus === 429 || httpStatus === 503) {
      retryAfterMs = parseRetryAfterHeader(res.headers?.get?.('retry-after')) ?? (await readRetryDelayFromBody(res));
    }
    logAiFailure({ httpStatus, reason });
    throw unavailable(reason, { retryable, httpStatus, retryAfterMs });
  }

  try {
    return await res.json();
  } catch {
    logAiFailure({ httpStatus: res.status, reason: AI_REASON.OVERLOADED, kind: 'bad-body' });
    throw unavailable(AI_REASON.OVERLOADED, { retryable: true });
  }
}

/** Parse JSON từ text của LLM, chịu được rào ```json ... ``` hoặc chữ thừa quanh object */
export function parseJsonText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw aiError('AI_PARSE_FAILED', 'AI không trả về nội dung', { retryable: true });
  }
  const s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const tryParse = (v) => {
    try {
      const out = JSON.parse(v);
      return out !== null && typeof out === 'object' ? out : undefined;
    } catch {
      return undefined;
    }
  };
  let out = tryParse(s);
  if (out === undefined) {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end > start) out = tryParse(s.slice(start, end + 1));
  }
  if (out === undefined) {
    throw aiError('AI_PARSE_FAILED', 'AI trả về JSON không hợp lệ', { retryable: true });
  }
  return out;
}

export const l2Normalize = (vec) => {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? vec : vec.map((x) => x / norm);
};
