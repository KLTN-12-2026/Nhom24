import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateJson, retryDelayMs } from '../src/ai/providers/llmProvider.js';
import { aiError, unavailable } from '../src/ai/providers/http.js';
import { setMockResponder } from '../src/ai/providers/mock.js';
import { buildAdvice } from '../src/ai/index.js';
import { env } from '../src/config/env.js';

const KEY = 'sk-test-SECRET-KEY-123';
const saved = {};
const json = (status, body = {}, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const geminiOk = () => json(200, { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });

beforeEach(() => {
  for (const k of ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL', 'LLM_FALLBACK_MODEL', 'isTest']) saved[k] = env[k];
});
afterEach(() => {
  Object.assign(env, saved);
  setMockResponder(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lớp gọi LLM chịu lỗi (HTTP giả lập)', () => {
  beforeEach(() => {
    env.LLM_PROVIDER = 'gemini';
    env.LLM_API_KEY = KEY;
    env.LLM_MODEL = 'main-model';
    env.LLM_FALLBACK_MODEL = '';
  });

  it('503 rồi thành công thì trả kết quả sau 1 lần retry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(503)).mockResolvedValueOnce(geminiOk());
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateJson({ system: 's', prompt: 'p' })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 liên tục: thử 1 + 2 lần rồi AI_UNAVAILABLE loại quota, message tiếng Việt, không lộ key/URL', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(429, {}, { 'Retry-After': '1' }));
    vi.stubGlobal('fetch', fetchMock);
    const err = await generateJson({ system: 's', prompt: 'p' }).catch((e) => e);
    expect(fetchMock).toHaveBeenCalledTimes(1 + env.LLM_MAX_RETRIES);
    expect(err).toMatchObject({ code: 'AI_UNAVAILABLE', status: 503, details: [{ field: 'reason', message: 'quota' }] });
    expect(err.message).toMatch(/hạn mức/i);
    expect(JSON.stringify([err.message, err.details])).not.toMatch(/SECRET|googleapis|main-model/);
  });

  it.each([
    [503, 'overloaded', /quá tải/],
    [500, 'overloaded', /quá tải/],
    [400, 'config', /cấu hình/],
    [401, 'config', /cấu hình/],
    [403, 'config', /cấu hình/],
    [404, 'config', /cấu hình/],
  ])('HTTP %i phân loại là %s', async (status, reason, pattern) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json(status)));
    const err = await generateJson({ system: 's', prompt: 'p' }).catch((e) => e);
    expect(err.details[0].message).toBe(reason);
    expect(err.message).toMatch(pattern);
  });

  it('lỗi cấu hình (4xx) không retry', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(401));
    vi.stubGlobal('fetch', fetchMock);
    await generateJson({ system: 's', prompt: 'p' }).catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('thiếu khóa API là lỗi cấu hình, không gọi mạng', async () => {
    env.LLM_API_KEY = '';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const err = await generateJson({ system: 's', prompt: 'p' }).catch((e) => e);
    expect(err.details[0].message).toBe('config');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timeout được retry và tính là quá tải', async () => {
    const timeout = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
    const fetchMock = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(geminiOk());
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateJson({ system: 's', prompt: 'p' })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('đọc Retry-After (header) và retryDelay (body Gemini), chặn trần 20 giây', async () => {
    const run = async (res) => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => res()));
      return generateJson({ system: 's', prompt: 'p' }).catch((e) => e);
    };
    const a = await run(() => json(429, {}, { 'Retry-After': '7' }));
    expect(a.retryAfterMs).toBe(7000);
    const b = await run(() => json(429, { error: { details: [{ retryDelay: '3.5s' }] } }));
    expect(b.retryAfterMs).toBe(3500);
    expect(retryDelayMs({ retryAfterMs: 90_000 }, 0)).toBe(20_000);
    expect(retryDelayMs({ retryAfterMs: 2500 }, 1)).toBe(2500);
    expect(retryDelayMs({}, 0)).toBe(1000);
    expect(retryDelayMs({}, 1)).toBe(2000);
  });

  it('log chỉ có mã HTTP và loại lỗi, không chứa key, URL hay tên model', async () => {
    env.isTest = false; // bật log; afterEach khôi phục
    const logs = [];
    vi.spyOn(console, 'warn').mockImplementation((...a) => logs.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a) => logs.push(a.join(' ')));
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json(429, {}, { 'Retry-After': '0' })));
    await generateJson({ system: 's', prompt: 'p' }).catch(() => {});
    const text = logs.join('\n');
    expect(text).toMatch(/http=429/);
    expect(text).toMatch(/quota/);
    expect(text).not.toMatch(/SECRET|https?:|googleapis|main-model/);
  });

  it('model dự phòng: model chính hết retry vì 429 thì thử phụ đúng một lần', async () => {
    env.LLM_FALLBACK_MODEL = 'backup-model';
    const urls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url) => {
        urls.push(url);
        return url.includes('backup-model') ? geminiOk() : json(429);
      }),
    );
    await expect(generateJson({ system: 's', prompt: 'p' })).resolves.toEqual({ ok: true });
    expect(urls.filter((u) => u.includes('main-model'))).toHaveLength(1 + env.LLM_MAX_RETRIES);
    expect(urls.filter((u) => u.includes('backup-model'))).toHaveLength(1);
  });

  it('model dự phòng cũng lỗi thì báo lỗi của model chính, chỉ thử phụ một lần', async () => {
    env.LLM_FALLBACK_MODEL = 'backup-model';
    const fetchMock = vi.fn().mockImplementation(async (url) => (url.includes('backup-model') ? json(404) : json(503)));
    vi.stubGlobal('fetch', fetchMock);
    const err = await generateJson({ system: 's', prompt: 'p' }).catch((e) => e);
    expect(err.details[0].message).toBe('overloaded');
    expect(fetchMock).toHaveBeenCalledTimes(1 + env.LLM_MAX_RETRIES + 1);
  });

  it('không chuyển model dự phòng khi lỗi cấu hình (401)', async () => {
    env.LLM_FALLBACK_MODEL = 'backup-model';
    const fetchMock = vi.fn().mockImplementation(async () => json(401));
    vi.stubGlobal('fetch', fetchMock);
    await generateJson({ system: 's', prompt: 'p' }).catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('provider mock: retry, model dự phòng, giới hạn đồng thời', () => {
  beforeEach(() => {
    env.LLM_PROVIDER = 'mock';
    env.LLM_MODEL = 'main-model';
    env.LLM_FALLBACK_MODEL = '';
  });

  it('503 rồi thành công', async () => {
    let calls = 0;
    setMockResponder(() => {
      if (++calls === 1) throw unavailable('overloaded', { retryable: true, httpStatus: 503 });
      return { ok: 1 };
    });
    await expect(generateJson({ system: 's', prompt: 'p' })).resolves.toEqual({ ok: 1 });
    expect(calls).toBe(2);
  });

  it('429 liên tục rồi chuyển model dự phòng thành công', async () => {
    env.LLM_FALLBACK_MODEL = 'backup-model';
    const models = [];
    setMockResponder(({ model }) => {
      models.push(model);
      if (model === 'main-model') throw unavailable('quota', { retryable: true, httpStatus: 429 });
      return { from: model };
    });
    await expect(generateJson({ system: 's', prompt: 'p' })).resolves.toEqual({ from: 'backup-model' });
    expect(models).toEqual(['main-model', 'main-model', 'main-model', 'backup-model']);
  });

  it('không dùng model dự phòng khi chưa cấu hình', async () => {
    const models = [];
    setMockResponder(({ model }) => {
      models.push(model);
      throw unavailable('quota', { retryable: true, httpStatus: 429 });
    });
    await expect(generateJson({ system: 's', prompt: 'p' })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(models).toHaveLength(1 + env.LLM_MAX_RETRIES);
  });

  it('tối đa 2 request chạy cùng lúc', async () => {
    let running = 0;
    let peak = 0;
    setMockResponder(async () => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
      return { ok: 1 };
    });
    await Promise.all(Array.from({ length: 7 }, () => generateJson({ system: 's', prompt: 'p' })));
    expect(peak).toBe(2);
  });

  it('request lỗi không làm kẹt hàng đợi', async () => {
    setMockResponder(() => {
      throw aiError('AI_PARSE_FAILED', 'hỏng');
    });
    await Promise.allSettled(Array.from({ length: 5 }, () => generateJson({ system: 's', prompt: 'p' })));
    setMockResponder(null);
    await expect(generateJson({ system: 's', prompt: 'p' })).resolves.toEqual({});
  });
});

describe('tư vấn nghề nghiệp: lý do bản mẫu', () => {
  it('LLM 429 thì aiGenerated=false và aiFailureReason=quota', async () => {
    env.LLM_PROVIDER = 'mock';
    setMockResponder(() => {
      throw unavailable('quota', { retryable: true, httpStatus: 429 });
    });
    const marketJobs = [
      {
        _id: 'j1',
        title: 'Backend Developer',
        category: 'it-software',
        requiredSkills: [{ name: 'Docker', normalized: 'docker' }],
      },
    ];
    const out = await buildAdvice({
      profile: { skills: [{ name: 'Node.js', normalized: 'nodejs' }] },
      targetRole: 'Backend Developer',
      targetCategory: 'it-software',
      marketJobs,
    });
    expect(out.aiGenerated).toBe(false);
    expect(out.aiFailureReason).toBe('quota');
  });
});
