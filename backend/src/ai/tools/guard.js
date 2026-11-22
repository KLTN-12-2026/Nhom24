import { findSkills } from './vocabulary.js';

// Chống prompt injection và bịa thông tin cho ba công cụ AI của ứng viên (CONTRACT 7.8).
// Nội dung CV, tin và câu trả lời là dữ liệu: làm sạch, lược bỏ câu giống chỉ dẫn, rồi bọc trong thẻ.

export const REDACTED = '[đã lược bỏ]';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Thẻ trùng tên thẻ phân cách hoặc vai trò hội thoại: bỏ để nội dung không "thoát" khỏi khối dữ liệu
const DELIMITER_TAGS =
  /<\/?\s*(?:cv_data|job_data|answer_data|advice_data|cv_text|system|assistant|user|instructions?)\b[^>]*>/gi;

const INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,50}\b(?:previous|above|prior|earlier|all|any|your|the)\b[^.\n]{0,40}\b(?:instructions?|prompts?|rules?|directions?|guidelines?)\b/i,
  /(?:bỏ qua|phớt lờ|quên đi|không cần tuân theo|không tuân theo)[^.\n]{0,50}(?:hướng dẫn|chỉ dẫn|chỉ thị|lệnh|quy tắc|yêu cầu|prompt)/i,
  /\b(?:system prompt|developer message|jailbreak)\b/i,
  /prompt hệ thống|lời nhắc hệ thống/i,
  /\b(?:you are now|from now on,? you|new instructions?)\b/i,
  /(?:từ bây giờ|bây giờ) (?:bạn|em|mày) (?:là|hãy|sẽ)|(?:hướng dẫn|chỉ dẫn) mới/i,
  /(?:cho|chấm|tặng|give|award)[^.\n]{0,25}(?:5\s*\/\s*5|5 điểm|điểm 5|điểm tối đa|điểm tuyệt đối|full (?:score|marks?)|max(?:imum)? score|100 điểm|10\/10)/i,
  /(?:reveal|print|show|repeat|leak|tiết lộ|in ra|lặp lại|cho xem)[^.\n]{0,30}(?:system prompt|your instructions|prompt|hướng dẫn hệ thống)/i,
  /(?:trả (?:về|lời) (?:duy nhất|chỉ)|respond (?:only )?with|output only)[^.\n]{0,40}(?:json|\{)/i,
];

/** Làm sạch văn bản không tin cậy: bỏ ký tự điều khiển và thẻ phân cách, gọn khoảng trắng, cắt độ dài */
export function sanitizeUntrusted(text, max = 4000) {
  const s = String(text ?? '')
    .replace(CONTROL_CHARS, ' ')
    .replace(DELIMITER_TAGS, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

const matchesInjection = (s) => INJECTION_PATTERNS.some((re) => re.test(s));

/** Thay câu giống chỉ dẫn bằng REDACTED. Trả { text, flagged } */
export function redactInjection(text) {
  let flagged = false;
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => {
      if (!matchesInjection(line)) return line;
      // dòng có thể ghép nhiều câu: chỉ lược bỏ câu vi phạm
      return line
        .split(/(?<=[.!?;])\s+/)
        .map((part) => {
          if (!matchesInjection(part)) return part;
          flagged = true;
          return REDACTED;
        })
        .join(' ');
    });
  return { text: lines.join('\n'), flagged };
}

/** sanitize + redact. Trả { text, flagged } */
export const prepareUntrusted = (text, max = 4000) => redactInjection(sanitizeUntrusted(text, max));

/** Bọc dữ liệu trong thẻ (nội dung đã được vô hiệu thẻ phân cách) */
export const wrapData = (tag, payload) =>
  `<${tag}>\n${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n</${tag}>`;

/** Sau khi lược bỏ chỉ dẫn, văn bản không còn đủ nội dung thật */
export function isMostlyInjection(redactedText, minWords = 5) {
  const rest = String(redactedText ?? '').split(REDACTED).join(' ');
  return (rest.match(/[\p{L}\p{N}]+/gu) ?? []).length < minWords;
}

const fold = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;
const COMPANY_RE =
  /(?:[Cc]ông ty|[Cc]ty|[Tt]ập đoàn|[Nn]gân hàng)\s+((?:\p{Lu}[\p{L}\p{N}&.-]*)(?:\s+\p{Lu}[\p{L}\p{N}&.-]*){0,3})/gu;

/**
 * Văn bản LLM viết có bám dữ liệu thật không: mọi con số phải có trong nguồn, mọi kỹ năng thuộc từ điển phải nằm trong
 * `allowedSkills`, mọi tên "công ty X" phải có trong nguồn. `sourceText` gồm cả hồ sơ lẫn tin.
 * `allowSmall`: cho phép số đếm một chữ số (lời khuyên kiểu "2 đến 3 gạch đầu dòng" không phải số liệu).
 */
export function isGrounded(text, { sourceText = '', allowedSkills = new Set(), numbers = true, companies = true, allowSmall = false } = {}) {
  const t = String(text ?? '');
  if (numbers) {
    const known = new Set((String(sourceText).match(NUMBER_RE) ?? []).map((n) => n.replace(',', '.')));
    for (const n of t.replace(/^\s*\d+[.)]\s+/gm, '').match(NUMBER_RE) ?? []) {
      if (allowSmall && /^\d$/.test(n)) continue;
      if (!known.has(n.replace(',', '.'))) return false;
    }
  }
  for (const key of findSkills(t)) {
    if (!allowedSkills.has(key)) return false;
  }
  if (companies) {
    const foldedSource = fold(sourceText);
    for (const m of t.matchAll(COMPANY_RE)) {
      if (!foldedSource.includes(fold(m[1].replace(/[.&-]+$/, '')))) return false;
    }
  }
  return true;
}

/** Giữ lại các câu bám dữ liệu (kiểm tra theo dòng, rồi theo câu), giữ nguyên xuống dòng */
export function filterGroundedText(text, opts) {
  let dropped = 0;
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line;
      return line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => {
          const ok = isGrounded(sentence, opts);
          if (!ok) dropped++;
          return ok;
        })
        .join(' ');
    });
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), dropped };
}

/** Mở rộng khóa kỹ năng ghép ("html/css") thành khóa đơn để so với từ điển */
export function expandKeys(keys) {
  const out = new Set();
  for (const k of keys) {
    out.add(k);
    if (k === 'html/css') {
      out.add('html');
      out.add('css');
    }
  }
  return out;
}
