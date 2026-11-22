import { MATCH } from '../../config/constants.js';
import { getSkillDisplayName } from '../cvParser/normalize.js';
import { computeExpEdu } from './expEdu.js';
import { buildExplanation, templateExplanation } from './explain.js';
import { computeSemantic } from './semantic.js';
import { computeSkillMatch } from './skillMatch.js';

const pct = (x) => Math.round(100 * x);

export function labelFor(score) {
  return MATCH.LABELS.find((l) => score >= l.min)?.label ?? 'low';
}

const isEmptyProfile = (p) =>
  !p ||
  (!(p.skills?.length) && !(p.experiences?.length) && !(p.headline || p.about || p.summary) && !p.totalYearsExperience);

/** Phần tính điểm thuần thuật toán, đồng bộ, không gọi LLM */
export function computeMatch({ profile, job, profileEmbedding, jobEmbedding }) {
  const skills = computeSkillMatch({ profile, job });
  const semantic = computeSemantic(profileEmbedding, jobEmbedding);
  const expEdu = computeExpEdu({ profile, job });

  const w = MATCH.WEIGHTS;
  let totalScore = pct(
    w.skillMatch * skills.score + w.semantic * semantic.score + w.experienceEducation * expEdu.score,
  );
  const notes = [];
  if (semantic.note) notes.push(semantic.note);
  if (isEmptyProfile(profile)) notes.push('Hồ sơ trống hoặc chưa có thông tin để đối chiếu');

  // Thiếu toàn bộ skill bắt buộc thì chặn tối đa NO_REQUIRED_MATCH_CAP
  if (skills.requiredTotal > 0 && skills.requiredMatchedCount === 0) {
    totalScore = Math.min(totalScore, MATCH.NO_REQUIRED_MATCH_CAP);
  }
  totalScore = Math.min(100, Math.max(0, totalScore));

  const skillLabels = Object.fromEntries(
    [...skills.matchedSkills, ...skills.missingRequiredSkills, ...skills.missingNiceToHave, ...skills.extraSkills].map(
      (key) => [key, getSkillDisplayName(key)],
    ),
  );

  return {
    totalScore,
    label: labelFor(totalScore),
    breakdown: {
      skillMatch: pct(skills.score),
      semantic: pct(semantic.score),
      experienceEducation: pct(expEdu.score),
      weights: { ...w },
    },
    matchedSkills: skills.matchedSkills,
    missingRequiredSkills: skills.missingRequiredSkills,
    missingNiceToHave: skills.missingNiceToHave,
    extraSkills: skills.extraSkills,
    skillLabels,
    experience: expEdu.experience,
    education: expEdu.education,
    semanticAvailable: semantic.available,
    explanation: '',
    notes,
    computedAt: new Date().toISOString(),
  };
}

/**
 * MatchResult (CONTRACT 7.2/7.4). Điểm do thuật toán tính; LLM chỉ viết `explanation`
 * khi withExplanation=true, lỗi LLM thì dùng câu mẫu và vẫn trả kết quả.
 * `notes` (mảng chuỗi) là trường bổ sung ghi các trường hợp biên như thiếu embedding.
 */
export async function scoreMatch({ profile, job, profileEmbedding, jobEmbedding, withExplanation = false }) {
  const result = computeMatch({ profile, job, profileEmbedding, jobEmbedding });
  result.explanation = withExplanation
    ? await buildExplanation({ result, job })
    : templateExplanation(result);
  return result;
}
