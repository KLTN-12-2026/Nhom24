import { MATCH } from '../../config/constants.js';
import { expandSkillName, normalizeSkillName } from '../cvParser/normalize.js';

const norm = (skill) => {
  const value = skill?.normalized || (skill?.name && normalizeSkillName(skill.name));
  return value ? String(value).trim().toLowerCase() : null;
};

/**
 * Skill kỹ thuật của hồ sơ: profile.skills (bỏ type 'language') + experiences[].technologies,
 * bỏ trùng theo `normalized`. Trả về Map normalized -> tên hiển thị.
 */
export function collectProfileSkills(profile) {
  const out = new Map();
  for (const skill of profile?.skills ?? []) {
    if (skill?.type === 'language') continue;
    const key = norm(skill);
    if (key && !out.has(key)) out.set(key, skill.name ?? key);
  }
  for (const exp of profile?.experiences ?? []) {
    for (const tech of exp?.technologies ?? []) {
      if (typeof tech !== 'string' || !tech.trim()) continue;
      for (const key of expandSkillName(tech)) {
        if (key && !out.has(key)) out.set(key, tech.trim());
      }
    }
  }
  return out;
}

const jobSkillKeys = (list) => {
  const seen = new Set();
  for (const skill of list ?? []) {
    const key = norm(skill);
    if (key) seen.add(key);
  }
  return [...seen];
};

/**
 * skillMatch trong [0,1] (CONTRACT 7.2): 0.8 · tỷ lệ bắt buộc + 0.2 · tỷ lệ ưu tiên.
 * Tin không có skill ưu tiên thì skillMatch = tỷ lệ bắt buộc; không có skill bắt buộc thì tỷ lệ bắt buộc = 1.
 */
export function computeSkillMatch({ profile, job }) {
  const have = collectProfileSkills(profile);
  const required = jobSkillKeys(job?.requiredSkills);
  const nice = jobSkillKeys(job?.niceToHaveSkills).filter((k) => !required.includes(k));

  const requiredMatched = required.filter((k) => have.has(k));
  const niceMatched = nice.filter((k) => have.has(k));

  const requiredRatio = required.length ? requiredMatched.length / required.length : 1;
  const niceRatio = nice.length ? niceMatched.length / nice.length : null;

  const score =
    niceRatio === null
      ? requiredRatio
      : MATCH.REQUIRED_SKILL_WEIGHT * requiredRatio + MATCH.NICE_TO_HAVE_WEIGHT * niceRatio;

  const wanted = new Set([...required, ...nice]);
  return {
    score,
    matchedSkills: [...requiredMatched, ...niceMatched],
    missingRequiredSkills: required.filter((k) => !have.has(k)),
    missingNiceToHave: nice.filter((k) => !have.has(k)),
    extraSkills: [...have.keys()].filter((k) => !wanted.has(k)).slice(0, MATCH.EXTRA_SKILLS_LIMIT),
    requiredTotal: required.length,
    requiredMatchedCount: requiredMatched.length,
  };
}
