import { AI_TOOLS } from '../../config/constants.js';
import { expandKeys, isGrounded, isMostlyInjection, prepareUntrusted } from './guard.js';
import { clip, runLlm } from './llm.js';
import {
  FEEDBACK_SCHEMA,
  FEEDBACK_SYSTEM,
  INTERVIEW_SCHEMA,
  INTERVIEW_SYSTEM,
  buildFeedbackPrompt,
  buildInterviewPrompt,
} from './prompts.js';
import { jobFullText, profileFullText, profileSkillKeys, profileSkillNames, wordCount, yearsText } from './profileView.js';
import { findSkills } from './vocabulary.js';

const INJECTION_NOTE =
  'Nội dung gửi vào có câu giống chỉ dẫn cho AI; hệ thống coi đó là dữ liệu, đã lược bỏ trước khi gửi cho AI và không làm theo.';

/* ---------- Bộ câu hỏi ---------- */

const BEHAVIORAL = [
  {
    question: (t) => `Hãy giới thiệu ngắn về bản thân và lý do bạn chọn vị trí ${t}.`,
    tip: 'Nói trong khoảng 1 đến 2 phút: bạn là ai, kinh nghiệm chính và vì sao vị trí này hợp với định hướng của bạn.',
    avoid: 'Đọc lại nguyên CV hoặc kể lể chuyện không liên quan tới công việc.',
  },
  {
    question: () => 'Kể về một lần bạn làm việc nhóm hiệu quả. Vai trò của bạn là gì?',
    tip: 'Dùng cấu trúc STAR: tình huống, nhiệm vụ, hành động của riêng bạn, kết quả.',
    avoid: 'Chỉ nói "chúng tôi" mà không rõ phần việc của bạn, hoặc chê đồng nghiệp.',
  },
  {
    question: () => 'Kể về một sai sót bạn từng mắc trong công việc hoặc học tập và bạn đã rút ra điều gì.',
    tip: 'Chọn sai sót thật, nêu cách bạn khắc phục và việc bạn làm khác đi sau đó.',
    avoid: 'Nói rằng bạn chưa từng mắc sai sót hoặc đổ lỗi cho hoàn cảnh.',
  },
  {
    question: () => 'Điểm mạnh và điểm yếu lớn nhất của bạn là gì?',
    tip: 'Mỗi điểm mạnh kèm một ví dụ; điểm yếu nên là điều có thật và bạn đang cải thiện.',
    avoid: 'Điểm yếu giả vờ là điểm mạnh ("tôi quá cầu toàn") hoặc điểm yếu ảnh hưởng nặng tới vị trí.',
  },
];

const SITUATIONAL = [
  {
    question: () => 'Hạn chót còn rất gần mà công việc vẫn chưa xong. Bạn sẽ xử lý như thế nào?',
    tip: 'Nêu cách xác định ưu tiên, trao đổi sớm với người liên quan và những gì bạn đề xuất để vẫn giao đúng cam kết.',
    avoid: 'Âm thầm làm quá giờ mà không báo ai, hoặc hứa hẹn điều không thể.',
  },
  {
    question: () => 'Đồng nghiệp không đồng ý với cách làm của bạn. Bạn sẽ làm gì?',
    tip: 'Lắng nghe lý do, dựa trên dữ liệu hoặc mục tiêu chung, sẵn sàng thử phương án khác nếu hợp lý.',
    avoid: 'Cố thắng bằng mọi giá hoặc nhờ cấp trên can thiệp ngay mà chưa trao đổi trực tiếp.',
  },
  {
    question: () => 'Bạn được giao một nhiệm vụ vượt quá kiến thức hiện tại. Bạn bắt đầu từ đâu?',
    tip: 'Nêu cách tìm hiểu (tài liệu, hỏi người có kinh nghiệm), chia nhỏ việc và báo cáo tiến độ.',
    avoid: 'Nhận làm nhưng không hỏi, hoặc từ chối ngay mà không thử tìm cách.',
  },
];

/** Bộ câu hỏi mẫu (10 câu) dựng từ kỹ năng của tin và câu hỏi hành vi, tình huống cố định */
export function templateQuestions(job) {
  const title = job.title;
  const skills = (job.requiredSkills ?? []).map((s) => s.name).filter(Boolean);
  const technical = skills.slice(0, 3).map((name, i) => ({
    type: 'technical',
    question:
      i === 0
        ? `Bạn hãy trình bày kinh nghiệm thực tế của mình với ${name}. Bạn đã dùng nó vào việc gì?`
        : i === 1
          ? `Bạn từng gặp khó khăn nào khi làm việc với ${name} và đã xử lý ra sao?`
          : `Khi làm việc với ${name}, bạn đảm bảo chất lượng công việc của mình bằng cách nào?`,
    tip: `Nêu một dự án hoặc công việc cụ thể có dùng ${name}, phần việc của bạn và kết quả. Nếu chưa dùng trong thực tế, hãy nói thẳng và nêu cách bạn đang học.`,
    avoid: 'Đọc thuộc định nghĩa chung chung hoặc nhận mình thành thạo khi chưa từng dùng.',
  }));
  const fillers = [
    {
      type: 'technical',
      question: `Theo bạn, những việc quan trọng nhất của một ${title} là gì?`,
      tip: 'Dựa vào mô tả tin tuyển dụng, chọn 2 đến 3 việc chính và giải thích vì sao.',
      avoid: 'Liệt kê mọi thứ mà không có thứ tự ưu tiên.',
    },
    {
      type: 'technical',
      question: `Bạn thường làm gì từng bước để hoàn thành một công việc điển hình của vị trí ${title}?`,
      tip: 'Mô tả quy trình của bạn từ lúc nhận yêu cầu tới khi bàn giao, kèm công cụ bạn dùng.',
      avoid: 'Chỉ nói kết quả mà bỏ qua cách làm.',
    },
    {
      type: 'technical',
      question: 'Bạn cập nhật kiến thức chuyên môn của mình bằng cách nào?',
      tip: 'Nêu nguồn học cụ thể và một điều bạn mới học gần đây.',
      avoid: 'Trả lời chung chung kiểu "tôi hay đọc tài liệu trên mạng".',
    },
  ];
  for (const f of fillers) {
    if (technical.length >= 3) break;
    technical.push(f);
  }
  const rest = [
    ...BEHAVIORAL.map((q) => ({ type: 'behavioral', question: q.question(title), tip: q.tip, avoid: q.avoid })),
    ...SITUATIONAL.map((q) => ({ type: 'situational', question: q.question(title), tip: q.tip, avoid: q.avoid })),
  ];
  return [...technical, ...rest].slice(0, AI_TOOLS.QUESTIONS_MAX).map((q, i) => ({ id: `q${i + 1}`, ...q }));
}

const typeCounts = (qs) => Object.fromEntries(AI_TOOLS.INTERVIEW_TYPES.map((t) => [t, qs.filter((q) => q.type === t).length]));

/**
 * InterviewSet (CONTRACT 7.8): 8 đến 10 câu kỹ thuật, hành vi, tình huống. LLM lỗi hoặc trả thiếu thì dùng bộ mẫu.
 */
export async function buildInterviewSet({ profile, job, companyName, gate }) {
  const notes = [];
  let flagged = false;
  const prep = (text, max) => {
    const r = prepareUntrusted(text, max);
    flagged ||= r.flagged;
    return r.text;
  };
  const candidate = {
    headline: prep(profile?.headline, 200),
    yearsExperience: yearsText(profile),
    skills: profileSkillNames(profile).slice(0, 15),
    experiences: (profile?.experiences ?? []).slice(0, 3).map((e) => ({
      title: prep(e.title, 120),
      company: prep(e.company, 120),
      description: prep(e.description, 300),
    })),
  };
  const jobData = {
    title: prep(job.title, 150),
    company: prep(companyName, 150),
    level: job.level,
    requiredSkills: (job.requiredSkills ?? []).map((s) => s.name),
    niceToHaveSkills: (job.niceToHaveSkills ?? []).map((s) => s.name),
    requirements: prep(job.requirements, 1200),
  };
  if (flagged) notes.push(INJECTION_NOTE);

  const { data, failure } = await runLlm(
    {
      tool: 'interview_set',
      system: INTERVIEW_SYSTEM,
      prompt: buildInterviewPrompt({ candidate, job: jobData }),
      jsonSchema: INTERVIEW_SCHEMA,
      temperature: 0.5,
    },
    gate,
  );

  const sourceText = `${profileFullText(profile)}\n${jobFullText(job, companyName)}`;
  const allowedSkills = expandKeys([
    ...profileSkillKeys(profile),
    ...(job.requiredSkills ?? []).map((s) => s.normalized || s.name),
    ...(job.niceToHaveSkills ?? []).map((s) => s.normalized || s.name),
    ...findSkills(sourceText),
  ]);
  const seen = new Set();
  const valid = [];
  for (const q of Array.isArray(data?.questions) ? data.questions : []) {
    const question = clip(q?.question, 300);
    const tip = clip(q?.tip, 400);
    const avoid = clip(q?.avoid, 300);
    if (!AI_TOOLS.INTERVIEW_TYPES.includes(q?.type) || question.length < 10 || !tip || !avoid || seen.has(question)) continue;
    if (!isGrounded(`${question}\n${tip}\n${avoid}`, { sourceText, allowedSkills, allowSmall: true })) continue;
    seen.add(question);
    valid.push({ type: q.type, question, tip, avoid });
  }
  const questions = valid.slice(0, AI_TOOLS.QUESTIONS_MAX);
  const counts = typeCounts(questions);
  const aiGenerated =
    questions.length >= AI_TOOLS.QUESTIONS_MIN && AI_TOOLS.INTERVIEW_TYPES.every((t) => counts[t] >= 2);
  if (!aiGenerated) {
    notes.push('Bộ câu hỏi do AI chưa sẵn sàng nên đang hiển thị bộ câu hỏi mẫu dựng từ yêu cầu của tin.');
  }
  return {
    questions: aiGenerated ? questions.map((q, i) => ({ id: `q${i + 1}`, ...q })) : templateQuestions(job),
    aiGenerated,
    aiFailureReason: aiGenerated ? null : (failure ?? 'invalid_output'),
    notes,
    generatedAt: new Date().toISOString(),
  };
}

/* ---------- Nhận xét câu trả lời ---------- */

/** Điểm tối đa cho phép theo độ dài: câu trả lời quá ngắn không thể được điểm cao, kể cả khi bị chèn lệnh */
export function scoreCap(words) {
  return words < 15 ? 2 : words < 40 ? 3 : words < 80 ? 4 : 5;
}

const EXAMPLE_HINT = /ví dụ|dự án|project|khi tôi|lần|đã làm|đã từng|tại công ty|tôi đã/i;
const RESULT_HINT = /kết quả|giúp|cải thiện|tăng|giảm|hoàn thành|đạt|rút ra|bài học/i;

/** Nhận xét mẫu bằng thuật toán: dựa trên độ dài, có ví dụ, có kết quả, có nhắc kỹ năng của tin */
export function templateFeedback({ question, job, answer }) {
  const words = wordCount(answer);
  const hasExample = EXAMPLE_HINT.test(answer);
  const hasResult = RESULT_HINT.test(answer);
  const keys = findSkills(answer);
  const mentionsSkill =
    question.type === 'technical' &&
    (job.requiredSkills ?? []).some((s) => keys.has(s.normalized || String(s.name).toLowerCase()));
  const points = (words >= 15) + (words >= 40) + hasExample + hasResult;
  const score = Math.max(1, Math.min(scoreCap(words), 1 + points));

  const strengths = [];
  const improvements = [];
  if (words >= 40) strengths.push('Câu trả lời có độ dài vừa đủ để trình bày ý.');
  if (hasExample) strengths.push('Có nhắc tới ví dụ hoặc trải nghiệm cụ thể của bản thân.');
  if (hasResult) strengths.push('Có nói tới kết quả hoặc bài học rút ra.');
  if (mentionsSkill) strengths.push('Có nhắc tới kỹ năng mà tin tuyển dụng yêu cầu.');
  if (!strengths.length) strengths.push('Bạn đã bắt đầu trả lời, hãy phát triển thêm ý để nhận xét được chính xác hơn.');
  if (words < 40) improvements.push('Câu trả lời còn ngắn, hãy thêm bối cảnh và phần việc cụ thể của bạn.');
  if (!hasExample) improvements.push('Thêm một ví dụ thật từ công việc, dự án hoặc việc học của bạn.');
  if (!hasResult) improvements.push('Nêu kết quả đạt được hoặc điều bạn rút ra để câu trả lời thuyết phục hơn.');
  if (question.type === 'technical' && !mentionsSkill) {
    improvements.push('Gắn câu trả lời với kỹ năng mà tin yêu cầu để nhà tuyển dụng thấy bạn phù hợp.');
  }
  if (!improvements.length) {
    improvements.push('Luyện thêm cách trình bày theo cấu trúc STAR: tình huống, nhiệm vụ, hành động, kết quả.');
  }
  return { strengths: strengths.slice(0, 3), improvements: improvements.slice(0, 3), score };
}

const cleanList = (raw, ctx) =>
  (Array.isArray(raw) ? raw : [])
    .map((x) => clip(x, 250))
    .filter((x) => x.length >= 3 && isGrounded(x, ctx))
    .slice(0, 3);

/**
 * PracticeResult (CONTRACT 7.8). Điểm bị chặn trên theo độ dài câu trả lời. Câu trả lời chỉ còn chỉ dẫn sau khi lược bỏ
 * nhận bản mẫu điểm 1 và không gọi LLM (`llmAttempted=false`, không tốn lượt).
 */
export async function buildAnswerFeedback({ job, question, answer, gate }) {
  const notes = [];
  const prepared = prepareUntrusted(answer, AI_TOOLS.ANSWER_MAX);
  if (prepared.flagged) notes.push(INJECTION_NOTE);

  if (prepared.flagged && isMostlyInjection(prepared.text)) {
    return {
      result: {
        strengths: ['Bạn đã gửi nội dung để nhận xét.'],
        improvements: [
          'Nội dung chủ yếu là câu giống chỉ dẫn gửi cho AI chứ không phải câu trả lời cho câu hỏi. Hãy trả lời trực tiếp, nêu ví dụ cụ thể của bạn.',
        ],
        score: 1,
      },
      aiGenerated: false,
      aiFailureReason: 'blocked',
      notes,
      llmAttempted: false,
    };
  }

  const text = prepared.text;
  const words = wordCount(text);
  const jobData = {
    title: prepareUntrusted(job.title, 150).text,
    requiredSkills: (job.requiredSkills ?? []).map((s) => s.name),
  };
  let llmAttempted = false;
  const { data, failure } = await runLlm(
    {
      tool: 'interview_answer',
      system: FEEDBACK_SYSTEM,
      prompt: buildFeedbackPrompt({
        question: { type: question.type, question: question.question, tip: question.tip },
        job: jobData,
        answer: text,
      }),
      jsonSchema: FEEDBACK_SCHEMA,
      temperature: 0.3,
    },
    {
      offline: gate?.offline,
      acquire: async () => {
        await gate?.acquire?.();
        llmAttempted = true;
      },
      release: () => gate?.release?.(),
    },
  );

  const allowedSkills = expandKeys([
    ...(job.requiredSkills ?? []).map((s) => s.normalized || s.name),
    ...(job.niceToHaveSkills ?? []).map((s) => s.normalized || s.name),
    ...findSkills(`${question.question} ${question.tip} ${job.title} ${text}`),
  ]);
  const ctx = { sourceText: text, allowedSkills, numbers: false, companies: false };
  const strengths = cleanList(data?.strengths, ctx);
  const improvements = cleanList(data?.improvements, ctx);
  const rawScore = Math.round(Number(data?.score));
  const aiGenerated = strengths.length > 0 && improvements.length > 0 && Number.isFinite(rawScore) && rawScore >= 1;

  if (!aiGenerated) {
    notes.push('Nhận xét do AI chưa sẵn sàng nên đang hiển thị nhận xét mẫu dựa trên độ dài và nội dung câu trả lời.');
    return {
      result: templateFeedback({ question, job, answer: text }),
      aiGenerated: false,
      aiFailureReason: failure ?? 'invalid_output',
      notes,
      llmAttempted,
    };
  }
  return {
    result: { strengths, improvements, score: Math.max(1, Math.min(5, rawScore, scoreCap(words))) },
    aiGenerated: true,
    aiFailureReason: null,
    notes,
    llmAttempted,
  };
}
