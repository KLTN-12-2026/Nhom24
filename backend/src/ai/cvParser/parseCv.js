import { createHash } from 'node:crypto';
import { generateJson } from '../providers/llmProvider.js';
import { aiError } from '../providers/http.js';
import { extractText } from './extractText.js';
import { normalizeCvParsed } from './normalize.js';
import { buildCvPrompt, CV_JSON_SCHEMA, MAX_CV_CHARS } from './prompt.js';

export const MIN_CV_CHARS = 100;

/**
 * Phân tích CV: trích text -> LLM -> chuẩn hóa. Không ghi log nội dung CV.
 * Lỗi: CV_UNREADABLE (text < 100 ký tự hoặc file hỏng), AI_PARSE_FAILED, AI_UNAVAILABLE.
 * @returns {Promise<{ parsed: object, text: string, textHash: string }>}
 */
export async function parseCv({ filePath, mimeType }) {
  const text = await extractText({ filePath, mimeType });
  if (text.length < MIN_CV_CHARS) {
    throw aiError('CV_UNREADABLE', 'CV không đủ nội dung văn bản (có thể là ảnh scan), vui lòng tải bản có thể chọn được chữ');
  }
  const textHash = createHash('sha256').update(text).digest('hex');

  const { system, prompt, truncated } = buildCvPrompt(text);
  const raw = await generateJson({ tool: 'cv_parse', system, prompt, jsonSchema: CV_JSON_SCHEMA, temperature: 0.1 });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw aiError('AI_PARSE_FAILED', 'AI trả về kết quả không đúng định dạng');
  }

  const parsed = normalizeCvParsed(raw);
  if (truncated) {
    parsed.warnings.push(`CV quá dài, chỉ phân tích ${MAX_CV_CHARS.toLocaleString('vi-VN')} ký tự đầu`);
  }
  return { parsed, text, textHash };
}
