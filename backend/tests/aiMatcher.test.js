import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildJobText,
  buildProfileText,
  embedTexts,
  rankJobsForProfile,
  rankProfilesForJob,
  scoreMatch,
} from '../src/ai/index.js';
import { computeExpEdu } from '../src/ai/matcher/expEdu.js';
import { collectProfileSkills, computeSkillMatch } from '../src/ai/matcher/skillMatch.js';
import { computeSemantic, cosine } from '../src/ai/matcher/semantic.js';
import { setMockResponder } from '../src/ai/providers/mock.js';
import { env } from '../src/config/env.js';

let previousProvider;
beforeAll(() => {
  previousProvider = env.LLM_PROVIDER;
  env.LLM_PROVIDER = 'mock';
});
afterEach(() => setMockResponder(null));
afterAll(() => {
  env.LLM_PROVIDER = previousProvider;
});

const sk = (...names) => names.map((n) => ({ name: n, normalized: n }));
const profile = (extra = {}) => ({
  headline: 'Dev',
  skills: [
    { name: 'React', normalized: 'react', type: 'technical' },
    { name: 'English', normalized: 'english', type: 'language' },
  ],
  experiences: [{ title: 'Dev', description: 'x', technologies: ['Node.js', 'ReactJS'] }],
  totalYearsExperience: 2,
  highestEducation: 'bachelor',
  ...extra,
});
const job = (extra = {}) => ({
  title: 'Frontend',
  requiredSkills: sk('react', 'nodejs'),
  niceToHaveSkills: sk('docker'),
  minYearsExperience: 2,
  minEducation: 'bachelor',
  ...extra,
});
const unit = (dim, i) => Array.from({ length: dim }, (_, k) => (k === i ? 1 : 0));

describe('skillMatch', () => {
  it('gộp skill từ profile.skills và technologies, bỏ trùng, loại ngôn ngữ nói', () => {
    expect([...collectProfileSkills(profile()).keys()].sort()).toEqual(['nodejs', 'react']);
  });

  it('0.8 bắt buộc + 0.2 ưu tiên', () => {
    const r = computeSkillMatch({ profile: profile(), job: job() });
    expect(r.score).toBeCloseTo(0.8 * 1 + 0.2 * 0);
    expect(r.matchedSkills).toEqual(['react', 'nodejs']);
    expect(r.missingNiceToHave).toEqual(['docker']);
    const half = computeSkillMatch({
      profile: profile({ skills: sk('react', 'docker'), experiences: [] }),
      job: job({ niceToHaveSkills: sk('docker', 'k8s') }),
    });
    expect(half.score).toBeCloseTo(0.8 * 0.5 + 0.2 * 0.5);
    // skill ưu tiên trùng skill bắt buộc không bị đếm hai lần
    const dup = computeSkillMatch({ profile: profile({ skills: sk('react'), experiences: [] }), job: job({ niceToHaveSkills: sk('react') }) });
    expect(dup.score).toBeCloseTo(0.5);
  });

  it('tin không có skill ưu tiên: skillMatch = tỷ lệ bắt buộc', () => {
    const r = computeSkillMatch({ profile: profile({ experiences: [] }), job: job({ niceToHaveSkills: [] }) });
    expect(r.score).toBeCloseTo(0.5);
  });

  it('extraSkills và missingRequiredSkills', () => {
    const r = computeSkillMatch({ profile: profile({ skills: sk('figma') , experiences: [] }), job: job() });
    expect(r.extraSkills).toEqual(['figma']);
    expect(r.missingRequiredSkills).toEqual(['react', 'nodejs']);
  });
});

describe('semantic', () => {
  it('cosine và hai mốc hiệu chỉnh', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(computeSemantic([1, 0], [1, 0]).score).toBe(1); // (1-0.7)/0.2 > 1 -> kẹp 1
    expect(computeSemantic([1, 0], [0, 1]).score).toBe(0); // cos 0 -> kẹp 0
    const c = 0.8; // (0.8-0.7)/0.2 = 0.5
    expect(computeSemantic([1, 0], [c, Math.sqrt(1 - c * c)]).score).toBeCloseTo(0.5);
  });

  it('thiếu embedding hoặc lệch độ dài: 0 kèm ghi chú', () => {
    expect(computeSemantic(null, [1]).score).toBe(0);
    expect(computeSemantic(null, [1]).note).toBeTruthy();
    expect(computeSemantic([1, 0], [1]).note).toBeTruthy();
  });
});

describe('expEdu', () => {
  it('kinh nghiệm theo tỷ lệ, học vấn theo bậc', () => {
    expect(computeExpEdu({ profile: profile({ totalYearsExperience: 1 }), job: job() }).score).toBeCloseTo(0.7 * 0.5 + 0.3);
    expect(computeExpEdu({ profile: profile({ highestEducation: 'college' }), job: job() }).score).toBeCloseTo(0.7 + 0.15);
    expect(computeExpEdu({ profile: profile({ highestEducation: 'high_school' }), job: job() }).score).toBeCloseTo(0.7);
  });

  it('requiredYears = 0 thì phần kinh nghiệm = 1', () => {
    const r = computeExpEdu({ profile: profile({ totalYearsExperience: 0 }), job: job({ minYearsExperience: 0 }) });
    expect(r.score).toBeCloseTo(1);
    expect(r.experience.met).toBe(true);
  });

  it('thiếu highestEducation thì lấy từ educations', () => {
    const r = computeExpEdu({ profile: profile({ highestEducation: undefined, educations: [{ degree: 'master' }] }), job: job() });
    expect(r.education.candidate).toBe('master');
  });
});

describe('scoreMatch', () => {
  const dim = env.EMBEDDING_DIM;

  it('ghép đúng công thức và trọng số', async () => {
    const r = await scoreMatch({
      profile: profile(),
      job: job(),
      profileEmbedding: unit(dim, 0),
      jobEmbedding: unit(dim, 0),
    });
    // skill 0.8, semantic 1, expEdu 1 -> 0.4 + 0.3 + 0.2 = 0.9
    expect(r.totalScore).toBe(90);
    expect(r.label).toBe('excellent');
    expect(r.breakdown).toMatchObject({ skillMatch: 80, semantic: 100, experienceEducation: 100 });
    expect(r.breakdown.weights).toEqual({ skillMatch: 0.5, semantic: 0.3, experienceEducation: 0.2 });
    expect(r.notes).toEqual([]);
  });

  it('chặn tối đa 40 khi thiếu toàn bộ skill bắt buộc', async () => {
    const r = await scoreMatch({
      profile: profile({ skills: sk('figma'), experiences: [] }),
      job: job(),
      profileEmbedding: unit(dim, 0),
      jobEmbedding: unit(dim, 0),
    });
    expect(r.totalScore).toBe(40);
    expect(r.label).toBe('low');
  });

  it('nhãn theo ngưỡng', async () => {
    const mk = async (cosv) => {
      const e = new Array(dim).fill(0);
      e[0] = cosv;
      e[1] = Math.sqrt(1 - cosv * cosv);
      return scoreMatch({ profile: profile(), job: job({ niceToHaveSkills: [] }), profileEmbedding: unit(dim, 0), jobEmbedding: e });
    };
    // skill 1 (0.5) + expEdu 1 (0.2) = 70 trước semantic
    expect((await mk(0.7)).totalScore).toBe(70);
    expect((await mk(0.7)).label).toBe('good');
    expect((await mk(0.9)).label).toBe('excellent');
  });

  it('thiếu embedding: semantic 0 và có ghi chú, vẫn trả kết quả', async () => {
    const r = await scoreMatch({ profile: profile(), job: job() });
    expect(r.breakdown.semantic).toBe(0);
    expect(r.notes.length).toBe(1);
    expect(r.totalScore).toBe(60);
  });

  it('hồ sơ rỗng không ném lỗi', async () => {
    const r = await scoreMatch({ profile: {}, job: job() });
    expect(r.totalScore).toBeLessThanOrEqual(40);
    expect(r.notes.join(' ')).toMatch(/Hồ sơ trống/);
    const r2 = await scoreMatch({ profile: null, job: job() });
    expect(r2.matchedSkills).toEqual([]);
  });

  it('explanation: LLM (mock) khi withExplanation, cắt 300 ký tự', async () => {
    const r = await scoreMatch({ profile: profile(), job: job(), withExplanation: true });
    expect(r.explanation).toMatch(/^Mock:/);
    setMockResponder(async () => ({ explanation: 'a'.repeat(1000) }));
    const long = await scoreMatch({ profile: profile(), job: job(), withExplanation: true });
    expect(long.explanation.length).toBeLessThanOrEqual(300);
  });

  it('LLM lỗi hoặc trả sai dạng: dùng câu mẫu, điểm không đổi', async () => {
    const base = await scoreMatch({ profile: profile({ skills: sk('react'), experiences: [] }), job: job() });
    setMockResponder(async () => {
      throw new Error('boom');
    });
    const failed = await scoreMatch({ profile: profile({ skills: sk('react'), experiences: [] }), job: job(), withExplanation: true });
    expect(failed.totalScore).toBe(base.totalScore);
    expect(failed.explanation).toContain('React');
    expect(failed.explanation).toContain('Node.js');
    setMockResponder(async () => ({ explanation: 42 }));
    const bad = await scoreMatch({ profile: profile(), job: job(), withExplanation: true });
    expect(bad.explanation).toMatch(/Khớp/);
  });
});

describe('text và ranking', () => {
  it('buildProfileText / buildJobText', () => {
    const t = buildProfileText(profile({ about: 'Giới thiệu' }));
    expect(t).toContain('Dev');
    expect(t).toContain('Giới thiệu');
    expect(t).toContain('React');
    expect(t).not.toContain('English');
    expect(buildJobText(job({ description: 'mô tả', requirements: 'yêu cầu' }))).toBe('Frontend\nmô tả\nyêu cầu\nreact, nodejs, docker');
    expect(buildProfileText(null)).toBe('');
  });

  it('rankJobsForProfile sắp xếp giảm dần, cắt limit, trả jobId', async () => {
    const [pe, ja, jb] = await embedTexts(['react node', 'react node', 'cooking']);
    const jobs = [
      { job: { _id: 'b', ...job({ requiredSkills: sk('cooking') }) }, embedding: jb },
      { job: { _id: 'a', ...job() }, embedding: ja },
    ];
    const rows = await rankJobsForProfile({ profile: profile(), profileEmbedding: pe, jobs, limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].jobId).toBe('a');
    expect(rows[0].result.totalScore).toBeGreaterThan(40);
  });

  it('rankProfilesForJob', async () => {
    const [je, pa, pb] = await embedTexts(['react node', 'react node', 'cooking']);
    const profiles = [
      { profile: { _id: 'p2', ...profile({ skills: sk('figma'), experiences: [] }) }, embedding: pb },
      { profile: { _id: 'p1', ...profile() }, embedding: pa },
    ];
    const rows = await rankProfilesForJob({ job: job(), jobEmbedding: je, profiles });
    expect(rows.map((r) => r.profileId)).toEqual(['p1', 'p2']);
    expect(await rankProfilesForJob({ job: job(), jobEmbedding: je, profiles: [] })).toEqual([]);
  });
});
