import { computeMatch } from './scoreMatch.js';
import { templateExplanation } from './explain.js';

const idOf = (doc) => String(doc?._id ?? doc?.id ?? '');

// Điểm cao trước; bằng điểm thì ưu tiên skillMatch rồi semantic; còn lại giữ thứ tự đầu vào (sort ổn định)
const byScoreDesc = (a, b) =>
  b.result.totalScore - a.result.totalScore ||
  b.result.breakdown.skillMatch - a.result.breakdown.skillMatch ||
  b.result.breakdown.semantic - a.result.breakdown.semantic;

const take = (rows, limit) => (Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows);

function rank(items, compute, key) {
  const rows = items.map((item) => {
    const result = compute(item);
    result.explanation = templateExplanation(result); // xếp hạng hàng loạt không gọi LLM
    return { [key]: idOf(item[key === 'jobId' ? 'job' : 'profile']), result };
  });
  return rows.sort(byScoreDesc);
}

/** Xếp hạng các tin cho một hồ sơ (không gọi LLM, explanation là câu mẫu) */
export async function rankJobsForProfile({ profile, profileEmbedding, jobs = [], limit }) {
  const rows = rank(
    jobs,
    ({ job, embedding }) => computeMatch({ profile, job, profileEmbedding, jobEmbedding: embedding }),
    'jobId',
  );
  return take(rows, limit);
}

/** Xếp hạng các hồ sơ cho một tin (không gọi LLM, explanation là câu mẫu) */
export async function rankProfilesForJob({ job, jobEmbedding, profiles = [], limit }) {
  const rows = rank(
    profiles,
    ({ profile, embedding }) => computeMatch({ profile, job, profileEmbedding: embedding, jobEmbedding }),
    'profileId',
  );
  return take(rows, limit);
}
