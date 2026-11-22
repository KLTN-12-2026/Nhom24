import { AI_TOOLS } from '../../config/constants.js';
import { getSkillDisplayName } from '../cvParser/normalize.js';
import { labelFor } from '../matcher/scoreMatch.js';
import { computeSkillMatch } from '../matcher/skillMatch.js';
import { findSkills } from './vocabulary.js';
import { profileFullText, profileSegments, wordCount } from './profileView.js';

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const MAX_MISSING_KEYWORDS = 8;
const pct = (x) => Math.round(100 * x);
const names = (keys) => keys.map(getSkillDisplayName);

// Mục "dự án": hồ sơ không có mục riêng nên đoán qua từ khóa trong phần giới thiệu và mô tả kinh nghiệm
const PROJECT_HINT = /dự án|du an|project|đồ án|do an|github|portfolio/i;

const jobKeySet = (list) => new Set((list ?? []).map((s) => s?.normalized || s?.name).filter(Boolean).map((k) => String(k).toLowerCase()));

/** Từ khóa của tin: kỹ năng thuộc từ điển xuất hiện trong mô tả/yêu cầu nhưng không nằm trong danh sách kỹ năng khai báo */
export function jobKeywords(job) {
  const declared = new Set([...jobKeySet(job?.requiredSkills), ...jobKeySet(job?.niceToHaveSkills)]);
  const found = findSkills([job?.title, job?.description, job?.requirements].filter(Boolean).join('\n'));
  return [...found].filter((k) => !declared.has(k));
}

/**
 * Phần thuật toán của "Chấm CV theo tin" (CONTRACT 7.8): kỹ năng bắt buộc thiếu, từ khóa chưa có, đủ/thiếu mục, độ dài.
 * `contact` = { email, phone } của tài khoản. Không gọi LLM.
 */
export function computeCvCheck({ profile, job, contact = {} }) {
  const p = profile ?? {};
  const skills = computeSkillMatch({ profile: p, job });
  const fullText = profileFullText(p);
  const haveInText = findSkills(fullText);

  // Từ khóa
  const keywords = jobKeywords(job);
  const missingKeywords = keywords.filter((k) => !haveInText.has(k) && !skills.matchedSkills.includes(k));
  const keywordScore = keywords.length ? (keywords.length - missingKeywords.length) / keywords.length : 1;

  // Các mục
  const experiences = p.experiences ?? [];
  const aboutText = [p.about, p.summary, p.headline, ...experiences.map((e) => e?.description)].filter(Boolean).join('\n');
  const hasEmail = Boolean(String(contact.email ?? '').trim());
  const hasPhone = Boolean(String(contact.phone ?? '').trim());
  const sections = [
    {
      key: 'contact',
      label: 'Thông tin liên hệ',
      present: hasEmail || hasPhone,
      note: !hasEmail && hasPhone ? 'Chưa có email' : hasEmail && !hasPhone ? 'Chưa có số điện thoại' : null,
    },
    { key: 'education', label: 'Học vấn', present: (p.educations ?? []).length > 0, note: null },
    {
      key: 'experience',
      label: 'Kinh nghiệm làm việc',
      present: experiences.length > 0,
      note: !experiences.length && Number(job?.minYearsExperience) > 0 ? 'Tin yêu cầu kinh nghiệm' : null,
    },
    { key: 'skills', label: 'Kỹ năng', present: (p.skills ?? []).length > 0, note: null },
    {
      key: 'projects',
      label: 'Dự án',
      present: PROJECT_HINT.test(aboutText),
      note: 'Đoán từ nội dung hồ sơ (hồ sơ không có mục dự án riêng)',
    },
  ];
  const sectionScore = sections.filter((s) => s.present).length / sections.length;

  // Độ dài
  const words = wordCount(fullText);
  const { CV_MIN_WORDS: min, CV_MAX_WORDS: max } = AI_TOOLS;
  const status = words < min ? 'short' : words > max ? 'long' : 'ok';
  const lengthScore = status === 'short' ? words / min : status === 'long' ? Math.max(0.5, max / words) : 1;

  const requiredScore = skills.requiredTotal ? skills.requiredMatchedCount / skills.requiredTotal : 1;
  const breakdown = {
    requiredSkills: pct(requiredScore),
    keywords: pct(keywordScore),
    sections: pct(sectionScore),
    length: pct(lengthScore),
  };
  const readinessScore = Math.min(
    100,
    Math.round(
      0.4 * breakdown.requiredSkills + 0.2 * breakdown.keywords + 0.25 * breakdown.sections + 0.15 * breakdown.length,
    ),
  );

  // Việc cần sửa
  const issues = [];
  for (const key of skills.missingRequiredSkills) {
    issues.push({
      id: `skill-${key}`,
      severity: 'high',
      area: 'skills',
      text: `Chưa thấy kỹ năng bắt buộc ${getSkillDisplayName(key)} trong hồ sơ. Nếu bạn thực sự đã dùng, hãy ghi vào mục Kỹ năng và nêu ví dụ trong kinh nghiệm.`,
    });
  }
  for (const s of sections.filter((x) => !x.present)) {
    issues.push({
      id: `section-${s.key}`,
      severity: s.key === 'projects' ? 'low' : 'medium',
      area: 'sections',
      text: `Hồ sơ chưa có mục ${s.label.toLowerCase()}${s.key === 'contact' ? '. Nhà tuyển dụng cần cách liên hệ với bạn' : ''}.`,
    });
  }
  if (skills.missingNiceToHave.length) {
    issues.push({
      id: 'nice-to-have',
      severity: 'low',
      area: 'skills',
      text: `Kỹ năng ưu tiên của tin mà hồ sơ chưa có: ${names(skills.missingNiceToHave).join(', ')}. Chỉ thêm nếu bạn thực sự có.`,
    });
  }
  const shownKeywords = missingKeywords.slice(0, MAX_MISSING_KEYWORDS);
  if (shownKeywords.length) {
    issues.push({
      id: 'keywords',
      severity: shownKeywords.length >= 4 ? 'medium' : 'low',
      area: 'keywords',
      text: `Từ khóa trong mô tả tin chưa xuất hiện trong hồ sơ: ${names(shownKeywords).join(', ')}.`,
    });
  }
  if (status === 'short') {
    issues.push({
      id: 'length-short',
      severity: 'medium',
      area: 'length',
      text: `Nội dung hồ sơ khoảng ${words} từ, ngắn hơn mức tối thiểu ${min} từ. Hãy mô tả rõ hơn việc đã làm và kết quả.`,
    });
  } else if (status === 'long') {
    issues.push({
      id: 'length-long',
      severity: 'low',
      area: 'length',
      text: `Nội dung hồ sơ khoảng ${words} từ, dài hơn mức nên có (${max} từ). Hãy lược bớt phần ít liên quan tới tin.`,
    });
  }
  experiences.forEach((e, i) => {
    if (wordCount(e?.description) < 8) {
      issues.push({
        id: `exp-${i + 1}-short`,
        severity: 'low',
        area: 'sections',
        text: `Mô tả công việc tại ${e?.company || e?.title || `vị trí ${i + 1}`} còn rất ngắn. Nêu việc đã làm, công nghệ đã dùng và kết quả.`,
      });
    }
  });
  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const labelKeys = [...skills.missingRequiredSkills, ...skills.missingNiceToHave, ...shownKeywords];
  return {
    readinessScore,
    label: labelFor(readinessScore),
    breakdown,
    missingRequiredSkills: skills.missingRequiredSkills,
    missingNiceToHave: skills.missingNiceToHave,
    missingKeywords: shownKeywords,
    skillLabels: Object.fromEntries(labelKeys.map((k) => [k, getSkillDisplayName(k)])),
    sections,
    length: { words, status, min, max },
    issues,
    matchedSkills: skills.matchedSkills,
    segments: profileSegments(p),
  };
}
