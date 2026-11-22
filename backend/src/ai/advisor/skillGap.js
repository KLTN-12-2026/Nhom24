import { ADVICE } from '../../config/constants.js';
import { getSkillDisplayName, normalizeSkillName } from '../cvParser/normalize.js';
import { collectProfileSkills, computeSkillMatch } from '../matcher/skillMatch.js';

const fold = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
const tokens = (s) => fold(s).match(/[a-z0-9+#]+/g) ?? [];

// Từ chung chung của tên vị trí, không đủ để phân biệt hai vị trí trong cùng category
const GENERIC = new Set([
  'developer', 'engineer', 'specialist', 'staff', 'executive', 'junior', 'senior', 'middle', 'fresher', 'intern',
  'lead', 'nhan', 'vien', 'chuyen', 'lap', 'trinh', 'cong', 'viec', 'va', 'and', 'the',
]);

const skillKeys = (job) => {
  const keys = new Set();
  for (const s of [...(job?.requiredSkills ?? []), ...(job?.niceToHaveSkills ?? [])]) {
    const key = s?.normalized || (s?.name && normalizeSkillName(s.name));
    if (key) keys.add(String(key).trim().toLowerCase());
  }
  return keys;
};

/**
 * Chọn tin thị trường cho vị trí mục tiêu (mục 7.3): tin cùng category có tiêu đề chứa từ khóa của `targetRole`;
 * không đủ ADVICE.MIN_MARKET_JOBS tin thì mở rộng ra cả category. Trả { jobs, scope: 'role' | 'category' }.
 */
export function selectMarketJobs({ jobs = [], targetRole, targetCategory }) {
  const inCategory = jobs.filter((j) => !targetCategory || j.category === targetCategory);
  const all = tokens(targetRole);
  const keywords = all.filter((t) => !GENERIC.has(t));
  const wanted = keywords.length ? keywords : all;
  if (!wanted.length) return { jobs: inCategory, scope: 'category' };

  const byRole = inCategory.filter((j) => {
    const title = new Set(tokens(j.title));
    return wanted.some((t) => title.has(t));
  });
  return byRole.length >= ADVICE.MIN_MARKET_JOBS
    ? { jobs: byRole, scope: 'role' }
    : { jobs: inCategory, scope: 'category' };
}

export const importanceOf = (percent) =>
  percent >= ADVICE.HIGH_PERCENT ? 'high' : percent >= ADVICE.MEDIUM_PERCENT ? 'medium' : 'low';

/**
 * Skill còn thiếu và điểm sẵn sàng, hoàn toàn bằng thuật toán.
 * demand = số tin (trong marketJobs) có skill đó, bắt buộc hoặc ưu tiên.
 * readinessScore = 100 × (tổng trọng số skill đang có trong top 10 thị trường) / (tổng trọng số top 10), trọng số = tỷ lệ xuất hiện.
 */
export function computeSkillGap({ profile, marketJobs }) {
  const total = marketJobs.length;
  const have = collectProfileSkills(profile);
  const demand = new Map();
  for (const job of marketJobs) for (const key of skillKeys(job)) demand.set(key, (demand.get(key) ?? 0) + 1);

  const ranked = [...demand.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, ADVICE.TOP_SKILLS);
  const topWeight = top.reduce((sum, [, n]) => sum + n, 0);
  const haveWeight = top.reduce((sum, [key, n]) => sum + (have.has(key) ? n : 0), 0);
  const readinessScore = topWeight ? Math.round((100 * haveWeight) / topWeight) : 0;

  const skillGaps = ranked
    .filter(([key]) => !have.has(key))
    .slice(0, ADVICE.MAX_GAPS)
    .map(([key, count]) => {
      const demandPercent = Math.round((100 * count) / total);
      return {
        skill: key,
        importance: importanceOf(demandPercent),
        demandCount: count,
        demandPercent,
        reason: `Xuất hiện trong ${demandPercent}% tin (${count}/${total} tin) cùng nhóm vị trí đang tuyển`,
      };
    });

  const strengths = top.filter(([key]) => have.has(key)).map(([key]) => key);
  return { readinessScore, skillGaps, strengthSkills: strengths, marketTop: top.map(([key]) => key) };
}

/**
 * Tin hợp nhất với hồ sơ về mặt skill (không cần embedding) và các tên vị trí gần nhất.
 * Vị trí: gộp theo tiêu đề đã chuẩn hóa, matchPercent = trung bình điểm skill của các tin cùng tiêu đề.
 */
export function rankMarket({ profile, marketJobs }) {
  const rows = marketJobs
    .map((job) => ({ job, percent: Math.round(100 * computeSkillMatch({ profile, job }).score) }))
    .sort((a, b) => b.percent - a.percent);

  const groups = new Map();
  for (const { job, percent } of rows) {
    const key = fold(job.title).replace(/\s+/g, ' ').trim();
    const g = groups.get(key) ?? { title: String(job.title).trim(), percents: [] };
    g.percents.push(percent);
    groups.set(key, g);
  }
  const roles = [...groups.values()]
    .map((g) => ({ title: g.title, matchPercent: Math.round(g.percents.reduce((a, b) => a + b, 0) / g.percents.length) }))
    .sort((a, b) => b.matchPercent - a.matchPercent)
    .slice(0, ADVICE.MAX_ROLES);

  return {
    roles,
    suggestedJobs: rows.slice(0, ADVICE.MAX_SUGGESTED_JOBS).map(({ job, percent }) => ({
      id: String(job._id ?? job.id),
      title: job.title,
      matchPercent: percent,
    })),
  };
}

export const labelsFor = (keys) => Object.fromEntries([...new Set(keys)].map((k) => [k, getSkillDisplayName(k)]));
