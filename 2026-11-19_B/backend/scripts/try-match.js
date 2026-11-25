/**
 * Chạy thử matching trên dữ liệu seed trong MongoDB (cần đã chạy `node scripts/seed.js`):
 *   node scripts/try-match.js [--mock] [--verbose] [--job "<một phần tiêu đề tin>"]
 * In top 5 tin hợp nhất cho candidate1@demo.com và top 5 ứng viên cho một tin.
 * Embedding tính bằng embedTexts; --mock dùng provider mock (không tốn API, không gọi mạng).
 * --verbose in thêm cosine thô của từng cặp (hiệu chỉnh SEMANTIC_FLOOR/SEMANTIC_RANGE).
 * Không ghi gì vào DB, không in thông tin liên lạc.
 */
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB, redactSecrets } from '../src/config/db.js';
import { CandidateProfile, Job, User } from '../src/models/index.js';
import { cosine } from '../src/ai/matcher/semantic.js';
import {
  buildJobText,
  buildProfileText,
  embedTexts,
  rankJobsForProfile,
  rankProfilesForJob,
} from '../src/ai/index.js';

const args = process.argv.slice(2);
if (args.includes('--mock')) env.LLM_PROVIDER = 'mock';
const verbose = args.includes('--verbose');
const jobArg = args.includes('--job') ? args[args.indexOf('--job') + 1] : null;

const BATCH = 20;
async function embedAll(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) out.push(...(await embedTexts(texts.slice(i, i + BATCH))));
  return out;
}

const line = (name, { result }) =>
  `${String(result.totalScore).padStart(3)} ${result.label.padEnd(9)} ${name}\n` +
  `      skill ${result.breakdown.skillMatch} | semantic ${result.breakdown.semantic} | exp+edu ${result.breakdown.experienceEducation}` +
  ` | khớp: ${result.matchedSkills.join(', ') || '-'} | thiếu: ${result.missingRequiredSkills.join(', ') || '-'}`;

try {
  await connectDB();
  console.log(`Provider: ${env.LLM_PROVIDER}`);

  const user = await User.findOne({ email: 'candidate1@demo.com' }).lean();
  const profile = user && (await CandidateProfile.findOne({ userId: user._id }).lean());
  if (!profile) throw new Error('Không thấy candidate1@demo.com, hãy chạy node scripts/seed.js trước');

  const jobs = await Job.find({ status: 'published' }).lean();
  if (!jobs.length) throw new Error('Không có tin published nào trong DB');

  const [profileEmbedding, ...jobEmbeddings] = await embedAll([buildProfileText(profile), ...jobs.map(buildJobText)]);
  const titleOf = new Map(jobs.map((j) => [String(j._id), j.title]));

  const printCosines = (title, rows) => {
    console.log(`
-- cosine thô: ${title} --`);
    rows.sort((a, b) => b.cos - a.cos).forEach((r) => console.log(`  ${r.cos.toFixed(4)}  ${r.name}`));
    const cs = rows.map((r) => r.cos);
    console.log(`  min ${Math.min(...cs).toFixed(4)} | max ${Math.max(...cs).toFixed(4)} | avg ${(cs.reduce((a, b) => a + b, 0) / cs.length).toFixed(4)}`);
  };
  if (verbose) {
    printCosines('candidate1 x mọi tin', jobs.map((j, i) => ({ name: j.title, cos: cosine(profileEmbedding, jobEmbeddings[i]) })));
  }

  console.log(`\n== Top 5 tin cho candidate1@demo.com (${jobs.length} tin published) ==`);
  const topJobs = await rankJobsForProfile({
    profile,
    profileEmbedding,
    jobs: jobs.map((job, i) => ({ job, embedding: jobEmbeddings[i] })),
    limit: 5,
  });
  topJobs.forEach((row) => console.log(line(titleOf.get(row.jobId), row)));

  const targetId = jobArg
    ? jobs.find((j) => j.title.toLowerCase().includes(jobArg.toLowerCase()))?._id
    : topJobs[0].jobId;
  const jobIndex = jobs.findIndex((j) => String(j._id) === String(targetId));
  if (jobIndex < 0) throw new Error(`Không tìm thấy tin khớp "${jobArg}"`);

  const profiles = await CandidateProfile.find().lean();
  const names = new Map((await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).lean()).map((u) => [String(u._id), u.fullName]));
  const profileEmbeddings = await embedAll(profiles.map(buildProfileText));

  if (verbose) {
    printCosines(
      `mọi hồ sơ x tin "${jobs[jobIndex].title}"`,
      profiles.map((p, i) => ({ name: names.get(String(p.userId)) ?? String(p._id), cos: cosine(profileEmbeddings[i], jobEmbeddings[jobIndex]) })),
    );
  }

  console.log(`\n== Top 5 ứng viên cho tin "${jobs[jobIndex].title}" (${profiles.length} hồ sơ) ==`);
  const topProfiles = await rankProfilesForJob({
    job: jobs[jobIndex],
    jobEmbedding: jobEmbeddings[jobIndex],
    profiles: profiles.map((p, i) => ({ profile: p, embedding: profileEmbeddings[i] })),
    limit: 5,
  });
  const profileById = new Map(profiles.map((p) => [String(p._id), p]));
  topProfiles.forEach((row) => console.log(line(names.get(String(profileById.get(row.profileId).userId)) ?? row.profileId, row)));
} catch (err) {
  console.error(`Lỗi ${err.code ?? 'UNKNOWN'}: ${redactSecrets(err.message)}`);
  process.exitCode = 2;
} finally {
  await disconnectDB().catch(() => {});
}
