import { env } from '../../config/env.js';
import { l2Normalize } from './http.js';

/**
 * Nhà cung cấp giả (LLM_PROVIDER=mock): dữ liệu cố định, không gọi mạng, không tốn API.
 * Cố ý để vài chỗ "bẩn" (tên skill chưa chuẩn hóa) để test normalize.
 */
export const MOCK_CV_RAW = Object.freeze({
  fullName: 'Nguyễn Văn An',
  email: 'an.nguyen@example.com',
  phone: '0901234567',
  location: 'Hồ Chí Minh',
  summary: 'Lập trình viên fullstack 2 năm kinh nghiệm với React và Node.js.',
  skills: [
    { name: 'ReactJS', normalized: null, type: 'technical', level: 'advanced' },
    { name: 'Node.js', normalized: null, type: 'technical', level: 'intermediate' },
    { name: 'MongoDB', normalized: null, type: 'technical', level: 'intermediate' },
    { name: 'Docker', normalized: null, type: 'tool', level: 'beginner' },
    { name: 'Giao tiếp', normalized: null, type: 'soft', level: 'unknown' },
  ],
  experiences: [
    {
      company: 'Công ty ABC',
      title: 'Fullstack Developer',
      startDate: '2022-03',
      endDate: '2024-06',
      isCurrent: false,
      description: 'Xây dựng ứng dụng web bằng React và Node.js.',
      technologies: ['ReactJS', 'Node.js'],
    },
  ],
  educations: [
    {
      school: 'Đại học Bách Khoa',
      degree: 'bachelor',
      major: 'Khoa học máy tính',
      startYear: 2018,
      endYear: 2022,
      gpa: '3.2/4',
    },
  ],
  certifications: [{ name: 'AWS Cloud Practitioner', issuer: 'AWS', year: 2023 }],
  languages: [{ name: 'English', level: 'IELTS 6.5' }],
  totalYearsExperience: 2.5,
  highestEducation: 'bachelor',
  primaryField: 'it-software',
  seniority: 'junior',
  confidence: 0.9,
  warnings: [],
});

let responder = null;

/** Test dùng để giả lập phản hồi hoặc lỗi: fn({ system, prompt, jsonSchema }) trả object hoặc ném lỗi; null = về mặc định */
export const setMockResponder = (fn) => {
  responder = fn;
};

export const MOCK_MATCH_EXPLANATION = Object.freeze({
  explanation: 'Mock: ứng viên khớp các kỹ năng chính của tin, còn thiếu một vài kỹ năng ưu tiên.',
});

export const MOCK_CAREER_ADVICE = Object.freeze({
  summary: 'Mock: hồ sơ có nền tảng tốt, cần bổ sung vài kỹ năng thị trường đang cần.',
  strengths: ['Nền tảng JavaScript tốt'],
  recommendedRoles: [{ title: 'Fullstack Developer', matchPercent: 70, reason: 'Mock' }],
  learningRoadmap: [
    {
      phase: 1,
      durationWeeks: 4,
      goal: 'Mock: học Docker cơ bản',
      skills: ['docker'],
      actions: ['Đóng gói một dự án nhỏ bằng Docker'],
      resources: [{ title: 'Tài liệu chính thức Docker', type: 'doc', url: null }],
    },
  ],
});

// Công cụ AI cho ứng viên (CONTRACT 7.8). Cố ý trung tính: không số liệu, không kỹ năng, không tên công ty,
// để qua được kiểm tra "không bịa" với mọi hồ sơ.
export const MOCK_CV_REVIEW = Object.freeze({
  suggestions: [
    { segmentId: 'headline', suggestion: 'Mock: viết tiêu đề hồ sơ nêu rõ vị trí mục tiêu và công nghệ chính của bạn.' },
    { segmentId: 'skills', suggestion: 'Mock: đưa các kỹ năng khớp với tin lên đầu mục Kỹ năng và bỏ kỹ năng ít liên quan.' },
    { segmentId: 'experience', suggestion: 'Mock: với mỗi vị trí, nêu việc đã làm, công nghệ đã dùng và kết quả đạt được.' },
    { segmentId: 'about', suggestion: 'Mock: viết vài câu giới thiệu gắn điểm mạnh của bạn với yêu cầu của tin.' },
  ],
});

export const MOCK_COVER_LETTER = Object.freeze({
  text:
    'Kính gửi nhà tuyển dụng,\n\n' +
    'Tôi viết thư này để bày tỏ sự quan tâm tới vị trí trong tin tuyển dụng của quý công ty. Qua việc đọc mô tả công việc, tôi nhận thấy ' +
    'nhiều nội dung phù hợp với định hướng và những gì tôi đã làm được, như đã trình bày trong hồ sơ đính kèm.\n\n' +
    'Trong quá trình làm việc và học tập, tôi luôn cố gắng hoàn thành nhiệm vụ đúng hạn, chủ động trao đổi với đồng nghiệp và ' +
    'sẵn sàng học hỏi điều mới để cải thiện chất lượng công việc. Tôi tin rằng sự nghiêm túc và tinh thần cầu tiến sẽ giúp tôi nhanh chóng ' +
    'hòa nhập với đội ngũ và đóng góp cho mục tiêu chung.\n\n' +
    'Rất mong nhận được cơ hội trao đổi trực tiếp để giới thiệu rõ hơn về bản thân. Xin chân thành cảm ơn quý công ty đã dành thời gian xem xét hồ sơ.\n\n' +
    'Trân trọng.',
});

const mockQuestion = (type, i) => ({
  type,
  question: `Mock: câu hỏi ${type} số ${i} dành cho ứng viên của vị trí này.`,
  tip: 'Mock: nêu một ví dụ cụ thể, vai trò của bạn và kết quả đạt được.',
  avoid: 'Mock: tránh trả lời chung chung hoặc nhận những điều bạn chưa từng làm.',
});

export const MOCK_INTERVIEW_SET = Object.freeze({
  questions: [
    ...[1, 2, 3, 4].map((i) => mockQuestion('technical', i)),
    ...[1, 2, 3].map((i) => mockQuestion('behavioral', i)),
    ...[1, 2, 3].map((i) => mockQuestion('situational', i)),
  ],
});

export const MOCK_ANSWER_FEEDBACK = Object.freeze({
  strengths: ['Mock: câu trả lời đi đúng trọng tâm câu hỏi.'],
  improvements: ['Mock: thêm một ví dụ cụ thể và kết quả đạt được.'],
  score: 4,
});

// Chọn dữ liệu cố định theo jsonSchema.title (CONTRACT 7.5); title lạ thì trả {}
const FIXTURES = {
  CvReview: MOCK_CV_REVIEW,
  CoverLetter: MOCK_COVER_LETTER,
  InterviewSet: MOCK_INTERVIEW_SET,
  AnswerFeedback: MOCK_ANSWER_FEEDBACK,
  CVParsed: MOCK_CV_RAW,
  MatchExplanation: MOCK_MATCH_EXPLANATION,
  CareerAdvice: MOCK_CAREER_ADVICE,
};

export async function generateJson(opts) {
  if (responder) return responder(opts);
  const fixture = FIXTURES[opts.jsonSchema?.title];
  return fixture ? structuredClone(fixture) : {};
}

const tokenize = (text) => String(text).toLowerCase().match(/[\p{L}\p{N}+#.]+/gu) ?? [];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Embedding tất định kiểu túi từ băm: cùng từ thì cùng chiều nên văn bản giống nhau có cosine cao */
export async function embed(texts) {
  return texts.map((text) => {
    const vec = new Array(env.EMBEDDING_DIM).fill(0);
    for (const tok of tokenize(text)) {
      const h = hash(tok);
      vec[h % env.EMBEDDING_DIM] += h & 0x10000 ? 1 : -1;
    }
    if (vec.every((x) => x === 0)) vec[0] = 1;
    return l2Normalize(vec);
  });
}
