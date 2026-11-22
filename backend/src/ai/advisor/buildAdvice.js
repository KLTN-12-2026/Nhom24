import { ADVICE } from '../../config/constants.js';
import { getSkillDisplayName, normalizeSkillName } from '../cvParser/normalize.js';
import { generateJson } from '../providers/llmProvider.js';
import { ADVICE_SCHEMA, ADVICE_SYSTEM, buildAdvicePrompt } from './prompt.js';
import { computeSkillGap, labelsFor, rankMarket, selectMarketJobs } from './skillGap.js';

const clip = (text, max) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};
const strings = (v, max) => (Array.isArray(v) ? v : []).map((x) => clip(x, 200)).filter(Boolean).slice(0, max);

/** Lộ trình mẫu: mỗi giai đoạn gồm tối đa 2 kỹ năng thiếu, xếp theo mức cần của thị trường */
export function templateRoadmap(skillGaps) {
  const phases = [];
  for (let i = 0; i < skillGaps.length && phases.length < 4; i += 2) {
    const chunk = skillGaps.slice(i, i + 2);
    const names = chunk.map((g) => getSkillDisplayName(g.skill));
    phases.push({
      phase: phases.length + 1,
      durationWeeks: chunk.some((g) => g.importance === 'high') ? 4 : 3,
      goal: `Nắm vững ${names.join(' và ')}`,
      skills: chunk.map((g) => g.skill),
      actions: names.map((n) => `Học ${n} qua tài liệu chính thức và làm một dự án nhỏ áp dụng ${n}`),
      resources: names.map((n) => ({ title: `Tài liệu chính thức của ${n}`, type: 'doc', url: null })),
    });
  }
  return phases;
}

export function templateSummary({ targetRole, readinessScore, skillGaps }) {
  const top = skillGaps.slice(0, 3).map((g) => getSkillDisplayName(g.skill));
  const tail = top.length
    ? ` Nên ưu tiên bổ sung: ${top.join(', ')}.`
    : ' Hồ sơ đã đáp ứng các kỹ năng thị trường đang cần.';
  return clip(`Mức sẵn sàng cho vị trí ${targetRole} hiện là ${readinessScore}/100.${tail}`, ADVICE.SUMMARY_MAX_LENGTH);
}

function cleanRoadmap(raw, allowed) {
  const phases = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    const goal = clip(p?.goal, 200);
    if (!goal) continue;
    // LLM có thể trả tên hiển thị hoặc mã: chuẩn hóa rồi chỉ giữ skill nằm trong danh sách còn thiếu
    const skills = [
      ...new Set((Array.isArray(p.skills) ? p.skills : []).map((s) => normalizeSkillName(String(s)))),
    ].filter((k) => allowed.has(k));
    const weeks = Math.round(Number(p.durationWeeks));
    phases.push({
      phase: phases.length + 1,
      durationWeeks: Number.isFinite(weeks) ? Math.min(26, Math.max(1, weeks)) : 4,
      goal,
      skills,
      actions: strings(p.actions, 6),
      // url luôn null để không có liên kết bịa (mục 7.3)
      resources: (Array.isArray(p.resources) ? p.resources : [])
        .filter((r) => r && typeof r.title === 'string' && r.title.trim())
        .slice(0, 5)
        .map((r) => ({ title: clip(r.title, 120), type: clip(r.type, 20) || 'doc', url: null })),
    });
    if (phases.length === 6) break;
  }
  return phases;
}

/**
 * CareerAdvice (CONTRACT 7.3). Điểm, skillGaps, vị trí gợi ý và tin gợi ý do thuật toán tính;
 * LLM chỉ viết summary, strengths, lý do vị trí và learningRoadmap. LLM lỗi hoặc trả rỗng thì dùng bản mẫu
 * (`aiGenerated=false` kèm `notes`), không ném lỗi.
 */
export async function buildAdvice({ profile, targetRole, targetCategory, marketJobs = [] }) {
  const { jobs, scope } = selectMarketJobs({ jobs: marketJobs, targetRole, targetCategory });
  const gap = computeSkillGap({ profile, marketJobs: jobs });
  const market = rankMarket({ profile, marketJobs: jobs });
  const nameOf = getSkillDisplayName;
  const notes = [];
  if (!jobs.length) notes.push('Chưa có tin tuyển dụng nào cùng ngành để phân tích thị trường');
  else if (scope === 'category') {
    notes.push('Không đủ tin đúng vị trí mục tiêu nên phân tích trên toàn bộ tin cùng ngành');
  }

  const allowed = new Set(gap.skillGaps.map((g) => g.skill));
  const input = {
    targetRole,
    targetCategory,
    currentLevel: profile?.seniority ?? null,
    yearsExperience: profile?.totalYearsExperience ?? null,
    readinessScore: gap.readinessScore,
    marketJobCount: jobs.length,
    ownedMarketSkills: gap.strengthSkills.map(nameOf),
    skillGaps: gap.skillGaps.map((g) => ({
      skill: nameOf(g.skill),
      importance: g.importance,
      demandPercent: g.demandPercent,
    })),
    roles: market.roles,
  };

  let llm = null;
  let llmFailure = null; // nhóm lỗi AI_UNAVAILABLE (quota | overloaded | config) nếu có
  if (jobs.length) {
    try {
      llm = await generateJson({
        tool: 'career_advice',
        system: ADVICE_SYSTEM,
        prompt: buildAdvicePrompt(input),
        jsonSchema: ADVICE_SCHEMA,
        temperature: 0.4,
      });
    } catch (err) {
      llm = null; // 429, timeout, JSON hỏng...: rơi về bản mẫu
      llmFailure = err?.details?.find?.((d) => d.field === 'reason')?.message ?? 'invalid_output'; // quota | overloaded | config | budget | disabled
    }
  }

  const summary = typeof llm?.summary === 'string' ? clip(llm.summary, ADVICE.SUMMARY_MAX_LENGTH) : '';
  const roadmap = cleanRoadmap(llm?.learningRoadmap, allowed);
  const aiGenerated = Boolean(summary && (roadmap.length || !gap.skillGaps.length));
  // Lý do ngắn cho nhãn "Bản mẫu" ở frontend (CONTRACT 7.3)
  const aiFailureReason = aiGenerated ? null : !jobs.length ? 'no_market' : (llmFailure ?? 'invalid_output');
  if (!aiGenerated && jobs.length) {
    notes.push(
      'Lời tư vấn do AI chưa sẵn sàng nên đang hiển thị nội dung mẫu; điểm và kỹ năng còn thiếu vẫn được tính đầy đủ',
    );
  }

  // Lý do cho vị trí: lấy của LLM nếu khớp title, không thì câu mẫu
  const reasonByTitle = new Map(
    (Array.isArray(llm?.recommendedRoles) ? llm.recommendedRoles : [])
      .filter((r) => typeof r?.title === 'string' && typeof r?.reason === 'string')
      .map((r) => [r.title.trim().toLowerCase(), clip(r.reason, 200)]),
  );
  const recommendedRoles = market.roles.map((r) => ({
    ...r,
    reason:
      (aiGenerated && reasonByTitle.get(r.title.toLowerCase())) ||
      `Kỹ năng của bạn khớp khoảng ${r.matchPercent}% yêu cầu của các tin ${r.title}`,
  }));

  const llmStrengths = aiGenerated ? strings(llm.strengths, 5) : [];
  const strengths = llmStrengths.length
    ? llmStrengths
    : gap.strengthSkills.slice(0, 5).map((k) => `Đã có ${nameOf(k)}, kỹ năng thị trường đang cần`);

  const learningRoadmap = aiGenerated ? roadmap : templateRoadmap(gap.skillGaps);
  const skillKeys = [
    ...gap.skillGaps.map((g) => g.skill),
    ...gap.strengthSkills,
    ...learningRoadmap.flatMap((p) => p.skills),
  ];

  return {
    targetRole,
    targetCategory,
    currentLevel: profile?.seniority ?? null,
    readinessScore: gap.readinessScore,
    summary: aiGenerated
      ? summary
      : templateSummary({ targetRole, readinessScore: gap.readinessScore, skillGaps: gap.skillGaps }),
    strengths,
    skillGaps: gap.skillGaps,
    skillLabels: labelsFor(skillKeys),
    recommendedRoles,
    learningRoadmap,
    suggestedJobIds: market.suggestedJobs.map((j) => j.id),
    suggestedJobs: market.suggestedJobs,
    marketJobCount: jobs.length,
    marketScope: scope,
    aiGenerated,
    aiFailureReason,
    notes,
    generatedAt: new Date().toISOString(),
  };
}
