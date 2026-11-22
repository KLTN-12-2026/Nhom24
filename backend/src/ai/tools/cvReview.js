import { AI_TOOLS } from '../../config/constants.js';
import { getSkillDisplayName } from '../cvParser/normalize.js';
import { computeCvCheck } from './cvCheck.js';
import { expandKeys, isGrounded, prepareUntrusted } from './guard.js';
import { clip, runLlm } from './llm.js';
import { CV_REVIEW_SCHEMA, CV_REVIEW_SYSTEM, buildCvReviewPrompt } from './prompts.js';
import { jobFullText, profileFullText, profileSkillKeys } from './profileView.js';
import { findSkills } from './vocabulary.js';

const INJECTION_NOTE =
  'Hồ sơ hoặc tin có câu giống chỉ dẫn cho AI; hệ thống coi đó là dữ liệu, đã lược bỏ trước khi gửi cho AI và không làm theo.';

/** Gợi ý mẫu dựng từ kết quả thuật toán: luôn đủ 3 đến 5 gợi ý, mỗi gợi ý trỏ một đoạn có thật */
export function templateSuggestions(check, job) {
  const out = [];
  const seg = (id) => check.segments.find((s) => s.id === id);
  const push = (segmentId, suggestion) => {
    const s = seg(segmentId);
    if (s && out.length < AI_TOOLS.SUGGESTIONS_MAX && !out.some((o) => o.suggestion === suggestion)) {
      out.push({ segmentId, segmentLabel: s.label, suggestion });
    }
  };
  const names = (keys) => keys.map(getSkillDisplayName).join(', ');

  if (!seg('headline').text) {
    push('headline', `Thêm tiêu đề hồ sơ nêu rõ vị trí bạn nhắm tới, nếu đúng định hướng của bạn thì gần với "${job.title}".`);
  }
  if (!seg('about').text) {
    push('about', 'Viết 2 đến 3 câu giới thiệu: bạn là ai, mạnh ở đâu và vì sao quan tâm tới vị trí này.');
  }
  if (check.missingRequiredSkills.length) {
    push(
      'skills',
      `Mục Kỹ năng chưa có ${names(check.missingRequiredSkills.slice(0, 4))}. Nếu bạn thực sự đã dùng, hãy thêm vào và nêu một ví dụ cụ thể.`,
    );
  }
  if (!check.sections.find((s) => s.key === 'experience').present) {
    push('experience', 'Thêm mục kinh nghiệm: kể cả thực tập, dự án cá nhân hay công việc bán thời gian có liên quan tới tin.');
  }
  check.segments
    .filter((s) => s.id.startsWith('exp-') && check.issues.some((i) => i.id === `${s.id}-short`))
    .forEach((s) =>
      push(s.id, 'Mô tả còn ngắn: viết 2 đến 3 gạch đầu dòng gồm việc đã làm, công nghệ đã dùng và kết quả đạt được nếu có.'),
    );
  if (check.missingKeywords.length) {
    push(
      'about',
      `Mô tả tin có nhắc ${names(check.missingKeywords.slice(0, 4))}. Nếu bạn có kinh nghiệm liên quan, hãy nêu trong phần giới thiệu hoặc kinh nghiệm.`,
    );
  }
  if (check.matchedSkills.length) {
    push('skills', `Đưa các kỹ năng khớp với tin (${names(check.matchedSkills.slice(0, 4))}) lên đầu mục Kỹ năng.`);
  }
  // Bổ sung cho đủ tối thiểu
  push('experience', 'Với mỗi vị trí, nêu việc đã làm, công nghệ đã dùng và kết quả để nhà tuyển dụng thấy rõ đóng góp của bạn.');
  push('about', 'Dùng lại các từ khóa quan trọng trong mô tả tin (nếu đúng với bạn) để CV dễ được lọc theo từ khóa.');
  push('headline', 'Rút gọn tiêu đề hồ sơ thành một dòng: vị trí, cấp độ và công nghệ chính.');
  return out.slice(0, AI_TOOLS.SUGGESTIONS_MAX);
}

/**
 * CvReview (CONTRACT 7.8). Điểm, kỹ năng thiếu, từ khóa, mục và độ dài do thuật toán tính; LLM chỉ viết 3 đến 5 gợi ý
 * trỏ vào đoạn CV có thật. LLM lỗi hoặc trả sai thì dùng gợi ý mẫu (`aiGenerated=false`), không ném lỗi.
 * `gate` xem runLlm: có thể ném RATE_LIMITED khi hết lượt.
 */
export async function buildCvReview({ profile, job, contact, gate }) {
  const check = computeCvCheck({ profile, job, contact });
  const notes = [];

  // Dữ liệu gửi LLM: đã làm sạch và lược bỏ câu giống chỉ dẫn
  let flagged = false;
  const segments = check.segments.map((s) => {
    const r = prepareUntrusted(s.text, 700);
    flagged ||= r.flagged;
    return { id: s.id, label: s.label, text: r.text };
  });
  const requirements = prepareUntrusted(job.requirements, 1500);
  const description = prepareUntrusted(job.description, 1500);
  flagged ||= requirements.flagged || description.flagged;
  if (flagged) notes.push(INJECTION_NOTE);

  const { data, failure } = await runLlm(
    {
      tool: 'cv_review',
      system: CV_REVIEW_SYSTEM,
      prompt: buildCvReviewPrompt({
        segments,
        findings: {
          missingRequiredSkills: check.missingRequiredSkills.map(getSkillDisplayName),
          missingNiceToHave: check.missingNiceToHave.map(getSkillDisplayName),
          missingKeywords: check.missingKeywords.map(getSkillDisplayName),
          missingSections: check.sections.filter((s) => !s.present).map((s) => s.label),
          wordCount: check.length.words,
        },
        job: {
          title: clip(job.title, 150),
          level: job.level,
          requiredSkills: (job.requiredSkills ?? []).map((s) => s.name),
          niceToHaveSkills: (job.niceToHaveSkills ?? []).map((s) => s.name),
          requirements: requirements.text,
          description: description.text,
        },
      }),
      jsonSchema: CV_REVIEW_SCHEMA,
      temperature: 0.3,
    },
    gate,
  );

  // Kiểm tra: đúng đoạn CV, bám dữ liệu, không trùng; cần ít nhất SUGGESTIONS_MIN gợi ý hợp lệ
  const sourceText = `${profileFullText(profile)}\n${jobFullText(job)}`;
  const allowedSkills = expandKeys([
    ...profileSkillKeys(profile),
    ...(job.requiredSkills ?? []).map((s) => s.normalized || s.name),
    ...(job.niceToHaveSkills ?? []).map((s) => s.normalized || s.name),
    ...findSkills(sourceText),
  ]);
  const byId = new Map(check.segments.map((s) => [s.id, s]));
  const seen = new Set();
  const llmSuggestions = [];
  for (const item of Array.isArray(data?.suggestions) ? data.suggestions : []) {
    const segment = byId.get(String(item?.segmentId ?? '').trim());
    const text = clip(item?.suggestion, 400);
    if (!segment || text.length < 10 || seen.has(text) || !isGrounded(text, { sourceText, allowedSkills, allowSmall: true })) continue;
    seen.add(text);
    llmSuggestions.push({ segmentId: segment.id, segmentLabel: segment.label, suggestion: text });
    if (llmSuggestions.length === AI_TOOLS.SUGGESTIONS_MAX) break;
  }

  const aiGenerated = llmSuggestions.length >= AI_TOOLS.SUGGESTIONS_MIN;
  const aiFailureReason = aiGenerated ? null : (failure ?? 'invalid_output');
  if (!aiGenerated) {
    notes.push('Gợi ý do AI chưa sẵn sàng nên đang hiển thị gợi ý mẫu; điểm và danh sách việc cần sửa vẫn được tính đầy đủ');
  }

  const { segments: _segments, matchedSkills: _matched, ...rest } = check;
  return {
    ...rest,
    suggestions: aiGenerated ? llmSuggestions : templateSuggestions(check, job),
    aiGenerated,
    aiFailureReason,
    notes,
    generatedAt: new Date().toISOString(),
  };
}
