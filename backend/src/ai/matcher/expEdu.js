import { EDUCATION, MATCH } from '../../config/constants.js';

export const educationRank = (degree) => Math.max(0, EDUCATION.indexOf(degree));

const toYears = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

// highestEducation, nếu thiếu thì lấy bậc cao nhất trong educations[]
function candidateEducation(profile) {
  if (EDUCATION.includes(profile?.highestEducation)) return profile.highestEducation;
  let best = 'none';
  for (const edu of profile?.educations ?? []) {
    if (educationRank(edu?.degree) > educationRank(best)) best = edu.degree;
  }
  return best;
}

/** expEdu trong [0,1] (CONTRACT 7.2): 0.7 · kinh nghiệm + 0.3 · học vấn (đủ bậc 1, thấp hơn 1 bậc 0.5, còn lại 0) */
export function computeExpEdu({ profile, job }) {
  const candidateYears = toYears(profile?.totalYearsExperience);
  const requiredYears = toYears(job?.minYearsExperience);
  const expScore = requiredYears === 0 ? 1 : Math.min(1, candidateYears / requiredYears);

  const candidate = candidateEducation(profile);
  const required = EDUCATION.includes(job?.minEducation) ? job.minEducation : 'none';
  const gap = educationRank(required) - educationRank(candidate);
  const eduScore = gap <= 0 ? 1 : gap === 1 ? 0.5 : 0;

  return {
    score: MATCH.EXPERIENCE_WEIGHT * expScore + MATCH.EDUCATION_WEIGHT * eduScore,
    experience: { candidateYears, requiredYears, met: candidateYears >= requiredYears },
    education: { candidate, required, met: gap <= 0 },
  };
}
