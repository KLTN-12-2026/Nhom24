import { collectProfileSkills } from '../matcher/skillMatch.js';

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const DEGREE_TEXT = {
  none: '',
  highschool: 'THPT',
  college: 'Cao đẳng',
  bachelor: 'Đại học',
  master: 'Thạc sĩ',
  phd: 'Tiến sĩ',
};

const period = (e) => [clean(e.startDate), clean(e.endDate) || (e.isCurrent ? 'nay' : '')].filter(Boolean).join(' - ');

/** Tên kỹ năng như người dùng ghi trong hồ sơ (bỏ ngôn ngữ) */
export const profileSkillNames = (profile) =>
  (profile?.skills ?? []).filter((s) => s?.type !== 'language').map((s) => clean(s?.name)).filter(Boolean);

/**
 * Hồ sơ chia thành các đoạn có mã để gợi ý sửa CV trỏ đúng chỗ: headline, about, skills, experience (chung),
 * exp-N, edu-N. Luôn có bốn đoạn đầu; đoạn trống để trống `text` nhằm gợi ý "thêm" được.
 */
export function profileSegments(profile) {
  const p = profile ?? {};
  const segments = [
    { id: 'headline', label: 'Tiêu đề hồ sơ', text: clean(p.headline) },
    { id: 'about', label: 'Giới thiệu bản thân', text: clean(p.about) || clean(p.summary) },
    { id: 'skills', label: 'Kỹ năng', text: profileSkillNames(p).join(', ') },
    {
      id: 'experience',
      label: 'Mục Kinh nghiệm làm việc (chung)',
      text: (p.experiences ?? []).length ? `${p.experiences.length} vị trí đã ghi` : '',
    },
  ];
  (p.experiences ?? []).forEach((e, i) => {
    segments.push({
      id: `exp-${i + 1}`,
      label: `Kinh nghiệm: ${clean(e.title) || 'Vị trí'}${clean(e.company) ? ` tại ${clean(e.company)}` : ''}`,
      text: [period(e), clean(e.description), (e.technologies ?? []).map(clean).filter(Boolean).join(', ')]
        .filter(Boolean)
        .join('. '),
    });
  });
  (p.educations ?? []).forEach((e, i) => {
    segments.push({
      id: `edu-${i + 1}`,
      label: `Học vấn: ${clean(e.school) || 'Trường'}`,
      text: [DEGREE_TEXT[e.degree], clean(e.major), [e.startYear, e.endYear].filter(Boolean).join(' - '), clean(e.gpa)]
        .filter(Boolean)
        .join(', '),
    });
  });
  return segments;
}

/** Toàn bộ nội dung hồ sơ dạng văn bản: dùng đếm từ, tìm từ khóa và làm nguồn đối chiếu "không bịa" */
export function profileFullText(profile) {
  const p = profile ?? {};
  const parts = [clean(p.headline), clean(p.about) || clean(p.summary), clean(p.targetRole), profileSkillNames(p).join(', ')];
  for (const e of p.experiences ?? []) {
    parts.push(clean(e.title), clean(e.company), period(e), clean(e.description), (e.technologies ?? []).join(', '));
  }
  for (const e of p.educations ?? []) {
    parts.push(clean(e.school), DEGREE_TEXT[e.degree] ?? '', clean(e.major), [e.startYear, e.endYear].filter(Boolean).join(' '));
  }
  for (const c of p.certifications ?? []) parts.push(clean(c.name), clean(c.issuer), c.year ?? '');
  for (const l of p.languages ?? []) parts.push(clean(l.name), clean(l.level));
  if (Number.isFinite(p.totalYearsExperience)) parts.push(String(p.totalYearsExperience));
  return parts.filter((x) => x !== '' && x != null).join('\n');
}

export const wordCount = (text) => (String(text ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’+#./-]*/gu) ?? []).length;

/** Mã kỹ năng chuẩn hóa của hồ sơ (kể cả công nghệ trong kinh nghiệm) */
export const profileSkillKeys = (profile) => new Set(collectProfileSkills(profile).keys());

/** Số năm kinh nghiệm dạng chữ Việt ("2,5") hoặc null */
export const yearsText = (profile) => {
  const y = Number(profile?.totalYearsExperience);
  return Number.isFinite(y) && y > 0 ? String(y).replace('.', ',') : null;
};

/** Nội dung tin dùng làm dữ liệu cho LLM và nguồn đối chiếu */
export const jobFullText = (job, companyName) =>
  [job?.title, companyName, job?.description, job?.requirements, job?.benefits, job?.level]
    .map(clean)
    .filter(Boolean)
    .join('\n');
