import { SEARCH } from '../config/constants.js';
import { escapeRegex } from './queryHelpers.js';
import { foldText } from './text.js';

/** Tách từ khóa thành các từ không dấu, bỏ trùng, tối đa SEARCH.MAX_TOKENS từ */
export const searchTokens = (q) => [...new Set(foldText(q).split(' ').filter(Boolean))].slice(0, SEARCH.MAX_TOKENS);

/**
 * Regex khớp TỪ NGUYÊN VẸN trên văn bản đã bỏ dấu (`foldText`): "toan" khớp "ke toan" nhưng không khớp "toang".
 * Ranh giới từ là ký tự không phải chữ/số, nên "c++" và "c#" vẫn khớp đúng.
 * Với `prefix: true` (v1.14, dành cho từ CUỐI của câu tìm kiếm, người dùng có thể còn đang gõ dở) chỉ cần khớp phần đầu
 * của một từ: "dev" khớp "developer".
 */
export const wholeWordRegex = (foldedPhrase, { prefix = false } = {}) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegex(foldedPhrase)}${prefix ? '' : '($|[^a-z0-9])'}`);

/** Từ cuối của danh sách khớp theo tiền tố, các từ đầu khớp nguyên vẹn */
export const tokenRegex = (tokens, index) => wholeWordRegex(tokens[index], { prefix: index === tokens.length - 1 });

/** Điều kiện Mongo: mọi từ của `tokens` phải xuất hiện ở ít nhất một trường trong `fields` (`regex`: dạng đã chọn nguyên vẹn / tiền tố) */
export const tokenClause = (regex, fields, extra = []) => ({
  $or: [...fields.map((f) => ({ [f]: regex })), ...extra],
});

const hasWord = (foldedText, token, prefix = false) => wholeWordRegex(token, { prefix }).test(foldedText);

/**
 * Điểm liên quan của một tin: tiêu đề > kỹ năng > (tên công ty) > mô tả. Cụm từ liền nhau trong tiêu đề được cộng thêm,
 * tiêu đề bắt đầu bằng từ khóa cũng vậy. Chỉ dùng để xếp thứ tự, không trả ra API.
 */
export function scoreJob(job, tokens, companyMatches = new Set()) {
  const title = job.titleSearch ?? foldText(job.title);
  const description = job.descriptionSearch ?? foldText(job.description);
  const skills = (job.requiredSkills ?? []).map((s) => foldText(s.name));
  const phrase = tokens.join(' ');
  let score = 0;
  if (tokens.length > 1 && hasWord(title, phrase, true)) score += SEARCH.WEIGHT.TITLE_PHRASE;
  if (title.startsWith(tokens[0])) score += SEARCH.WEIGHT.TITLE_PREFIX;
  tokens.forEach((token, i) => {
    const prefix = i === tokens.length - 1; // từ cuối khớp theo tiền tố
    if (hasWord(title, token, prefix)) score += SEARCH.WEIGHT.TITLE;
    if (skills.some((s) => hasWord(s, token, prefix))) score += SEARCH.WEIGHT.SKILL;
    if (companyMatches.has(`${token}:${job.companyId}`)) score += SEARCH.WEIGHT.COMPANY;
    if (hasWord(description, token, prefix)) score += SEARCH.WEIGHT.DESCRIPTION;
  });
  return score;
}
