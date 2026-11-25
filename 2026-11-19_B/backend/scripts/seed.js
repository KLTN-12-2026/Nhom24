/**
 * Nạp dữ liệu mẫu vào MongoDB: node scripts/seed.js [--reset] [--full] [--demo] [--embed]
 *  - Luôn tính lại trường tìm kiếm không dấu (titleSearch, nameSearch...) cho mọi tin và công ty ở cuối.
 *  - data/seed_users.json      : tài khoản (mục 12.1). Employer có `company`, candidate có `profile`.
 *  - data/jobs/seed_jobs.json  : tin tuyển dụng, `employerEmail` chỉ ra công ty đăng tin,
 *                                hạn nộp là `deadlineInDays` (tính từ lúc chạy seed) hoặc `deadline` (ISO).
 * Chạy lại nhiều lần an toàn: user đã có (theo email) và tin đã có (theo employer + tiêu đề) được bỏ qua.
 * `--reset` xóa sạch dữ liệu nghiệp vụ trước khi nạp (chỉ dùng cho môi trường dev/demo).
 * `--full` nạp thêm 30 tin từ data/eval/jobs_extra.json (bộ tin của đánh giá AI, mục 12.1). Tin được rải vòng tròn
 *   cho các employer có trong seed_users.json (bỏ qua `employerEmail` trong file), hạn nộp 21-60 ngày, một vài tin
 *   để pending/draft như bộ cũ. Không cờ thì chỉ nạp bộ mặc định. Chạy lại không tạo trùng.
 * `--demo` nạp thêm bộ dữ liệu giao diện (mục 12.1, v1.11): data/demo/companies.json (18 công ty hư cấu, mỗi công ty một
 *   employer employer3..employer20@demo.com / Employer@123) và data/demo/jobs/*.json (60-70 tin, trải đều các ngành).
 *   Mỗi tin demo có `postedDaysAgo` (ngày đăng = lúc chạy seed trừ số ngày này), `deadlineInDays` (âm = đã hết hạn)
 *   và có thể đặt sẵn `viewsCount`, `applicationsCount`. Kết hợp được với --reset, --full, --embed; không đụng data/eval/.
 * Luôn thêm (v1.19) vài lượt theo dõi công ty và tìm kiếm đã lưu cho candidate1..3@demo.com; chạy lại không tạo trùng.
 * Luôn thêm (v1.20) hồ sơ ứng tuyển mẫu của candidate1..3 vào tin của employer1/2 ở đủ trạng thái, kèm sao, ghi chú nội bộ,
 *   lịch phỏng vấn và tin nhắn (seedHiring); khóa chống trùng là (tin, ứng viên) nên chạy lại không tạo thêm.
 * Luôn thêm (v1.21) kết quả mẫu của ba công cụ AI cho ứng viên (chấm CV theo tin, thư xin việc, câu hỏi phỏng vấn kèm một lượt luyện tập)
 *   cho candidate1..3 trên tin của employer1 (seedAiTools); dựng bằng thuật toán, không gọi LLM; chạy lại không tạo thêm.
 * Ví điểm mẫu (v1.25, seedWallet): candidate1 đã nạp gói 50 điểm và tiêu vài lượt (một lượt được hoàn), candidate2 có gói 20 điểm,
 *   một đơn thất bại và một đơn đang chờ; chạy lại không trùng.
 * Luôn thêm (v1.27) bốn tin kiểm duyệt mẫu (seedModeration): tự đăng, chờ vì dấu hiệu tự động, chờ vì bị báo cáo (employer1/2) và
 *   chờ vì công ty chưa xác minh (employer-unverified@demo.com); khóa chống trùng là (employer, tiêu đề); chạy lại không tạo thêm.
 * `--embed` sau khi nạp, tính embedding cho tin và hồ sơ còn thiếu/lỗi thời bằng provider hiện hành (theo .env),
 *   theo lô nhỏ; gọi API thật nên tốn quota. Không bật thì embedding được tính bù ở lần dùng AI đầu tiên.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { connectDB, describeConnection, disconnectDB, redactSecrets } from '../src/config/db.js';
import {
  AiDailyStat,
  AiToolResult,
  AiUserDaily,
  Application,
  ApplicationMessage,
  CandidateProfile,
  Company,
  CompanyFollow,
  InterviewPractice,
  Job,
  JobReport,
  ModerationEvent,
  Notification,
  SavedSearch,
  User,
  WalletHold,
  WalletOrder,
} from '../src/models/index.js';
import { PRIVACY } from '../src/config/constants.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/utils/hash.js';
import { foldText } from '../src/utils/text.js';
import { normalizeCity } from '../src/utils/provinces.js';
import { normalizeSkills } from '../src/ai/cvParser/normalize.js';
import {
  buildAnswerFeedback,
  buildCoverLetter,
  buildCvReview,
  buildInterviewSet,
  buildJobText,
  buildProfileText,
  embedTexts,
  scoreMatch,
} from '../src/ai/index.js';
import { hasVector, hashOf } from '../src/modules/ai/embeddings.js';
import { checkJobContent } from '../src/modules/jobs/autoCheck.js';
import { importantHash } from '../src/modules/jobs/moderation.js';
import { usageDay } from '../src/modules/ai/quota.js';
import { hashFilters, normalizeFilters } from '../src/modules/alerts/service.js';
import { buildParsedSnapshot } from '../src/modules/applications/service.js';
import { applyEntry } from '../src/modules/wallet/ledger.js';
import { getPackage, priceOf } from '../src/config/pricing.js';
import { seedCompanyImages } from './seedImages.js';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(scriptsDir, '../../data');
export const DEFAULT_USERS_FILE = path.join(DATA_DIR, 'seed_users.json');
export const DEFAULT_JOBS_FILE = path.join(DATA_DIR, 'jobs/seed_jobs.json');
export const DEMO_DIR = path.join(DATA_DIR, 'demo');
export const DEMO_USERS_FILE = path.join(DEMO_DIR, 'companies.json');
export const DEMO_JOBS_DIR = path.join(DEMO_DIR, 'jobs');
export const EXTRA_JOBS_FILE = path.join(DATA_DIR, 'eval/jobs_extra.json');
// Vị trí (theo thứ tự trong jobs_extra.json) của các tin không để published
const EXTRA_STATUS_OVERRIDES = { 9: 'pending', 19: 'draft', 27: 'pending' };

export const EMBED_BATCH_SIZE = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Không đọc được ${path.relative(process.cwd(), file)}: ${err.message}`);
  }
};

/** PDF một trang tối thiểu, đủ để admin mở xem trong dữ liệu demo (không phải giấy phép thật) */
function samplePdf(companyName) {
  const ascii = foldText(companyName).replace(/[^a-z0-9 ]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (GIAY PHEP KINH DOANH - MAU DEMO) Tj 0 -30 Td (${ascii}) Tj ET`;
  const NL = String.fromCharCode(10);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    ['<< /Length ' + stream.length + ' >>', 'stream', stream, 'endstream'].join(NL),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4' + NL;
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += [i + 1 + ' 0 obj', body, 'endobj', ''].join(NL);
  });
  const xref = pdf.length;
  pdf += ['xref', '0 ' + (objects.length + 1), '0000000000 65535 f ', ''].join(NL);
  offsets.forEach((o) => {
    pdf += String(o).padStart(10, '0') + ' 00000 n ' + NL;
  });
  pdf += ['trailer', '<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>', 'startxref', String(xref), '%%EOF', ''].join(NL);
  return pdf;
}

/**
 * Trạng thái xác minh công ty của dữ liệu mẫu (v1.14): `company.verification = { status, taxCode }`.
 * `pending` kèm một giấy phép mẫu ở uploads/private/licenses để trang duyệt của admin có file để xem.
 */
function verificationFields(userId, company) {
  const v = company.verification;
  if (!v || v.status === 'unverified') return null;
  const now = new Date();
  const fields = { taxCode: v.taxCode, verificationStatus: v.status, verificationSubmittedAt: now };
  if (v.status === 'verified') fields.verificationReviewedAt = now;
  if (v.status === 'pending') {
    const dir = path.join(env.UPLOAD_DIR, 'private', 'licenses', String(userId));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'seed-license.pdf'), samplePdf(company.name));
    fields.businessLicense = {
      originalName: 'giay-phep-kinh-doanh.pdf',
      storedPath: `private/licenses/${userId}/seed-license.pdf`,
      mimeType: 'application/pdf',
      size: fs.statSync(path.join(dir, 'seed-license.pdf')).size,
      uploadedAt: now,
    };
  }
  return fields;
}

/** v1.23: tài khoản mẫu đã đồng ý Điều khoản và Quyền riêng tư phiên bản hiện hành */
const consentFields = () => ({ termsVersion: PRIVACY.TERMS_VERSION, termsAcceptedAt: new Date() });

async function seedUser(entry, summary) {
  const email = entry.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    // Dữ liệu tạo trước v1.14: bổ sung cờ đã xác minh email, và trạng thái xác minh cho công ty còn ở mặc định
    if (entry.emailVerified && !existing.emailVerified) {
      await User.updateOne({ _id: existing._id }, { emailVerified: true, emailVerifiedAt: new Date() });
    }
    const fields = entry.company && verificationFields(existing._id, entry.company);
    if (fields) {
      await Company.updateOne({ ownerId: existing._id, verificationStatus: { $in: [null, 'unverified'] } }, { $set: fields });
    }
    // v1.23: tài khoản mẫu tạo trước đó coi như đã đồng ý điều khoản hiện hành
    await User.updateOne({ _id: existing._id, termsVersion: { $exists: false } }, { $set: consentFields() });
    summary.skippedUsers.push(email);
    return;
  }

  const user = await User.create({
    email,
    passwordHash: await hashPassword(entry.password),
    fullName: entry.fullName,
    phone: entry.phone,
    role: entry.role,
    ...(entry.emailVerified && { emailVerified: true, emailVerifiedAt: new Date() }),
    ...consentFields(),
  });

  if (entry.role === 'employer') {
    const { verification, ...company } = entry.company;
    await Company.create({ ownerId: user._id, ...company, ...verificationFields(user._id, entry.company) });
  } else if (entry.role === 'candidate') {
    const { cv, skills, ...rest } = entry.profile ?? {};
    const now = new Date();
    await CandidateProfile.create({
      userId: user._id,
      ...rest,
      skills: normalizeSkills(skills),
      // File CV thật do T10 xử lý; dữ liệu mẫu chỉ gắn kết quả phân tích có sẵn (không có storedPath)
      cv: cv && { ...cv, uploadedAt: now, parsedAt: now, parseStatus: 'done', warnings: [] },
    });
  }
  summary.createdUsers.push(email);
}

async function seedJob(entry, summary) {
  const { employerEmail, deadlineInDays, deadline, postedDaysAgo, ...fields } = entry;
  const employer = await User.findOne({ email: employerEmail.toLowerCase(), role: 'employer' });
  const company = employer && (await Company.findOne({ ownerId: employer._id }));
  if (!company) throw new Error(`Tin "${entry.title}": không tìm thấy employer ${employerEmail}`);

  if (await Job.exists({ employerId: employer._id, title: entry.title })) {
    summary.skippedJobs.push(entry.title);
    return;
  }

  // Tin demo có ngày đăng; chỉ tin đã từng published mới có publishedAt
  const postedAt = postedDaysAgo != null ? new Date(Date.now() - postedDaysAgo * DAY_MS) : null;
  const wasPublished = ['published', 'closed'].includes(fields.status);
  if (!fields.benefits && fields.benefitList?.length) fields.benefits = fields.benefitList.map((b) => `- ${b}`).join('\n');

  await Job.create({
    ...fields,
    ...(postedAt && { createdAt: postedAt, ...(wasPublished && { publishedAt: postedAt }) }),
    requiredSkills: normalizeSkills(fields.requiredSkills),
    niceToHaveSkills: normalizeSkills(fields.niceToHaveSkills),
    deadline: deadline ? new Date(deadline) : new Date(Date.now() + (deadlineInDays ?? 30) * DAY_MS),
    companyId: company._id,
    employerId: employer._id,
  });
  summary.createdJobs.push(entry.title);
}

// v1.19: theo dõi công ty và tìm kiếm đã lưu mẫu cho candidate1..3 (gắn với bộ tin mặc định). `follows` là email employer.
const ENGAGEMENT_SEED = {
  'candidate1@demo.com': {
    follows: ['employer1@demo.com'],
    searches: [
      { name: 'Backend Node.js tại TP. Hồ Chí Minh', filters: { q: 'node', city: 'TP. Hồ Chí Minh' }, frequency: 'instant' },
      { name: 'Việc làm từ xa', filters: { workMode: ['remote'] }, frequency: 'daily' },
    ],
  },
  'candidate2@demo.com': {
    follows: ['employer1@demo.com'],
    searches: [{ name: 'Dữ liệu và AI cho fresher', filters: { category: ['it-data-ai'], level: ['fresher', 'junior'] }, frequency: 'instant' }],
  },
  'candidate3@demo.com': {
    follows: ['employer2@demo.com'],
    searches: [
      { name: 'Marketing tại Hà Nội', filters: { category: ['marketing'], city: 'Hà Nội' }, frequency: 'instant' },
      { name: 'Thực tập thiết kế (đang tắt)', filters: { category: ['design'], level: ['intern'] }, frequency: 'off' },
    ],
  },
};

/** Thêm lượt theo dõi và tìm kiếm đã lưu mẫu; bỏ qua người/công ty chưa có và mục đã tồn tại nên chạy lại an toàn */
export async function seedEngagement() {
  const created = { follows: 0, searches: 0 };
  for (const [email, { follows, searches }] of Object.entries(ENGAGEMENT_SEED)) {
    const user = await User.findOne({ email, role: 'candidate' }).select('_id');
    if (!user) continue;
    for (const employerEmail of follows) {
      const employer = await User.findOne({ email: employerEmail, role: 'employer' }).select('_id');
      const company = employer && (await Company.findOne({ ownerId: employer._id }).select('_id'));
      if (!company) continue;
      const { upsertedCount } = await CompanyFollow.updateOne(
        { userId: user._id, companyId: company._id },
        { $setOnInsert: { userId: user._id, companyId: company._id } },
        { upsert: true },
      );
      created.follows += upsertedCount;
    }
    for (const { name, filters, frequency } of searches) {
      const normalized = normalizeFilters(filters);
      const filtersHash = hashFilters(normalized);
      if (await SavedSearch.exists({ userId: user._id, $or: [{ name }, { filtersHash }] })) continue;
      await SavedSearch.create({ userId: user._id, name, filters: normalized, filtersHash, frequency });
      created.searches += 1;
    }
  }
  return created;
}

// v1.20: hồ sơ ứng tuyển mẫu ở đủ trạng thái của quy trình tuyển dụng (mục 12.1). `path` là các bước đã đi qua, bước cuối là
// trạng thái hiện tại; `ageDays` là số ngày trước lúc nộp; `interview.inDays` là số ngày tới buổi phỏng vấn;
// `messages` là [bên gửi, nội dung, đã đọc?] theo thứ tự thời gian.
const HIRING_SEED = [
  {
    candidate: 'candidate1@demo.com', employer: 'employer1@demo.com', job: 'Backend Developer (Node.js)', ageDays: 9,
    path: ['submitted', 'viewed', 'shortlisted', 'interview'], rating: 5,
    note: 'Nền tảng Node.js tốt, đã làm dự án có hàng đợi và cache. Nên hỏi kỹ về thiết kế cơ sở dữ liệu.',
    interview: { inDays: 2, hour: 3, mode: 'online', location: 'https://meet.example.com/backend-phong-van', message: 'Buổi phỏng vấn gồm 20 phút trao đổi về dự án và 25 phút bài tập thiết kế API ngắn.', confirmation: 'confirmed' },
    messages: [
      ['employer', 'Chào bạn, cảm ơn bạn đã ứng tuyển. Chúng tôi muốn mời bạn phỏng vấn, lịch cụ thể ở mục Lịch phỏng vấn.', true],
      ['candidate', 'Dạ em cảm ơn anh chị, em đã xác nhận lịch và sẽ vào đúng giờ ạ.', true],
      ['employer', 'Bạn nhớ chuẩn bị máy tính có cài sẵn Node.js để làm bài tập nhé.', false],
    ],
  },
  {
    candidate: 'candidate2@demo.com', employer: 'employer1@demo.com', job: 'Backend Developer (Node.js)', ageDays: 6,
    path: ['submitted', 'viewed', 'shortlisted'], rating: 4,
    note: 'Ít kinh nghiệm thực tế hơn nhưng học nhanh. Cân nhắc nếu không còn ứng viên mạnh hơn.',
    messages: [
      ['candidate', 'Chào anh chị, vị trí này có hỗ trợ làm việc từ xa vài ngày mỗi tuần không ạ?', true],
      ['employer', 'Chào bạn, bên mình làm hybrid, 2 ngày ở văn phòng mỗi tuần.', false],
    ],
  },
  { candidate: 'candidate3@demo.com', employer: 'employer1@demo.com', job: 'Backend Developer (Node.js)', ageDays: 1, path: ['submitted'] },
  {
    candidate: 'candidate1@demo.com', employer: 'employer1@demo.com', job: 'Frontend Developer (React)', ageDays: 4,
    path: ['submitted', 'viewed'], rating: 3, note: 'CV thiên về backend, cần xem thêm sản phẩm giao diện.',
  },
  {
    candidate: 'candidate2@demo.com', employer: 'employer1@demo.com', job: 'Frontend Developer (React)', ageDays: 14,
    path: ['submitted', 'viewed', 'shortlisted', 'interview', 'offered'], rating: 5,
    note: 'Phỏng vấn rất tốt, đề xuất mức lương cao nhất khung.',
    interview: { inDays: -5, hour: 3, mode: 'onsite', location: 'Tầng 5, 12 Nguyễn Huệ, Quận 1', confirmation: 'confirmed' },
    messages: [
      ['employer', 'Chúc mừng bạn! Bên mình gửi đề nghị làm việc, chi tiết lương và ngày bắt đầu đã gửi qua email. Bạn phản hồi giúp trong tuần này nhé.', false],
    ],
  },
  {
    candidate: 'candidate3@demo.com', employer: 'employer1@demo.com', job: 'Frontend Developer (React)', ageDays: 12,
    path: ['submitted', 'viewed', 'rejected'], rating: 2, note: 'Thiếu kinh nghiệm React, kỹ năng chưa khớp yêu cầu.',
    rejectionReason: 'Vị trí này cần ít nhất 1 năm kinh nghiệm React thực tế. Chúc bạn sớm tìm được công việc phù hợp.',
  },
  {
    candidate: 'candidate1@demo.com', employer: 'employer1@demo.com', job: 'Data Analyst', ageDays: 30,
    path: ['submitted', 'viewed', 'shortlisted', 'interview', 'offered', 'hired'], rating: 5, note: 'Đã nhận việc, bắt đầu từ đầu tháng sau.',
  },
  {
    candidate: 'candidate2@demo.com', employer: 'employer1@demo.com', job: 'Data Analyst', ageDays: 5,
    path: ['submitted', 'viewed', 'interview'],
    interview: { inDays: 4, hour: 7, mode: 'onsite', location: 'Phòng họp A, 12 Nguyễn Huệ, Quận 1', message: 'Vui lòng đến sớm 10 phút để làm thủ tục tại quầy lễ tân.', confirmation: 'pending' },
  },
  {
    candidate: 'candidate3@demo.com', employer: 'employer1@demo.com', job: 'Machine Learning Engineer', ageDays: 7,
    path: ['submitted', 'viewed', 'shortlisted', 'interview'], rating: 3,
    interview: { inDays: 3, hour: 2, mode: 'online', location: 'https://meet.example.com/ml-phong-van', confirmation: 'reschedule_requested', proposedInDays: 5, responseNote: 'Hôm đó em có lịch thi cuối kỳ, em xin đổi sang hai ngày sau ạ.' },
    messages: [['candidate', 'Em đã gửi đề nghị đổi giờ phỏng vấn, mong anh chị xem giúp ạ.', false]],
  },
  { candidate: 'candidate1@demo.com', employer: 'employer2@demo.com', job: 'Nhân viên Kinh doanh B2B', ageDays: 2, path: ['submitted'] },
  { candidate: 'candidate3@demo.com', employer: 'employer2@demo.com', job: 'Digital Marketing Manager', ageDays: 10, path: ['submitted', 'viewed', 'withdrawn'] },
];

const HOUR_MS = 60 * 60 * 1000;

// v1.27: tin kiểm duyệt mẫu (mục 12.1). `kind` quyết định trạng thái và lý do; dấu hiệu tự động được tính bằng đúng bộ kiểm tra thật.
const UNVERIFIED_EMPLOYER = {
  email: 'employer-unverified@demo.com',
  password: 'Employer@123',
  fullName: 'Nhà tuyển dụng chưa xác minh',
  phone: '0912000021',
  role: 'employer',
  emailVerified: true,
  company: {
    name: 'Công ty Giải pháp Mới (chưa xác minh)',
    industry: 'Phần mềm',
    size: '1-10',
    city: 'Hà Nội',
    description: 'Công ty nhỏ mới tham gia nền tảng, hồ sơ xác minh chưa được gửi.',
  },
};

const moderationJob = (extra) => ({
  requirements: 'Có kinh nghiệm làm việc nhóm, chủ động và cẩn thận.',
  category: 'it-software',
  level: 'junior',
  employmentType: 'full-time',
  workMode: 'hybrid',
  city: 'Hồ Chí Minh',
  salary: { min: 15000000, max: 25000000, currency: 'VND', negotiable: false },
  benefitList: ['Bảo hiểm đầy đủ', 'Thưởng tháng 13', 'Làm việc linh hoạt'],
  requiredSkills: [{ name: 'SQL' }, { name: 'Excel' }],
  deadlineInDays: 30,
  ...extra,
});

const MODERATION_SEED = [
  {
    kind: 'auto_published',
    employer: 'employer1@demo.com',
    ...moderationJob({
      title: 'Chuyên viên Phân tích hệ thống (tự đăng)',
      description: 'Phân tích yêu cầu nghiệp vụ, viết tài liệu đặc tả và phối hợp với nhóm phát triển để triển khai các tính năng mới cho sản phẩm tuyển dụng.',
    }),
  },
  {
    kind: 'flagged',
    employer: 'employer1@demo.com',
    ...moderationJob({
      title: 'Cộng tác viên làm việc tại nhà',
      description: 'Việc nhẹ lương cao, làm tại nhà, nộp phí hồ sơ 300.000đ khi đăng ký. Liên hệ 0912 345 678 để được hướng dẫn chi tiết.',
      salary: { min: 8000000, max: 15000000, currency: 'VND', negotiable: false },
      level: 'fresher',
      employmentType: 'part-time',
    }),
  },
  {
    kind: 'reported',
    employer: 'employer2@demo.com',
    ...moderationJob({
      title: 'Nhân viên Hỗ trợ Khách hàng (đang bị báo cáo)',
      description: 'Tiếp nhận và giải đáp thắc mắc của khách hàng qua điện thoại và email, ghi nhận phản hồi và chuyển bộ phận liên quan xử lý.',
      category: 'sales',
      requiredSkills: [{ name: 'Giao tiếp' }, { name: 'Excel' }],
    }),
  },
  {
    kind: 'unverified',
    employer: UNVERIFIED_EMPLOYER.email,
    ...moderationJob({
      title: 'Lập trình viên Web (công ty chưa xác minh)',
      description: 'Phát triển và bảo trì các trang web nội bộ, làm việc với đội thiết kế để hiện thực giao diện theo mẫu có sẵn.',
      requiredSkills: [{ name: 'JavaScript' }, { name: 'HTML' }],
    }),
  },
];

/** Thêm các tin kiểm duyệt mẫu và nhật ký tương ứng; bỏ qua tin đã có (khóa employer + tiêu đề) nên chạy lại an toàn */
export async function seedModeration() {
  const created = { jobs: 0, events: 0, reports: 0 };
  await seedUser(UNVERIFIED_EMPLOYER, { createdUsers: [], skippedUsers: [] });

  for (const { kind, employer: email, deadlineInDays, ...fields } of MODERATION_SEED) {
    const employer = await User.findOne({ email, role: 'employer' });
    const company = employer && (await Company.findOne({ ownerId: employer._id }));
    if (!company) continue;
    if (await Job.exists({ employerId: employer._id, title: fields.title })) continue;

    const draft = { ...fields, requiredSkills: normalizeSkills(fields.requiredSkills) };
    const flags = checkJobContent(draft);
    const base = { ...draft, companyId: company._id, employerId: employer._id, deadline: new Date(Date.now() + deadlineInDays * DAY_MS), autoCheckedAt: new Date() };
    const live = kind === 'auto_published'; // đang hiển thị
    const wasPublished = live || kind === 'reported'; // tin bị báo cáo từng được tự đăng rồi mới về chờ duyệt
    const job = await Job.create({
      ...base,
      status: live ? 'published' : 'pending',
      submittedAt: new Date(),
      autoFlags: flags,
      ...(wasPublished && { publishedAt: new Date(), publishSource: 'auto' }),
      ...(!live && { pendingReason: { flagged: 'content_flags', reported: 'reported', unverified: 'unverified_company' }[kind] }),
    });
    if (wasPublished) await Job.updateOne({ _id: job._id }, { reviewedHash: importantHash(job) });
    created.jobs += 1;

    const event = { jobId: job._id, companyId: company._id, actorId: employer._id, actorRole: 'employer', from: 'draft', flags };
    if (wasPublished) await ModerationEvent.create({ ...event, action: 'auto_published', to: 'published' });
    else await ModerationEvent.create({ ...event, action: 'sent_to_review', to: 'pending', reason: job.pendingReason });
    created.events += 1;

    if (kind === 'reported') {
      const reporters = await User.find({ email: { $in: ['candidate1@demo.com', 'candidate2@demo.com', 'candidate3@demo.com'] } }).select('_id');
      for (const reporter of reporters) {
        await JobReport.updateOne(
          { jobId: job._id, reporterId: reporter._id },
          { $setOnInsert: { jobId: job._id, reporterId: reporter._id, reason: 'scam', detail: 'Yêu cầu chuyển tiền trước khi nhận việc.' } },
          { upsert: true },
        );
        created.reports += 1;
      }
      await ModerationEvent.create({ jobId: job._id, companyId: company._id, actorRole: 'system', action: 'reported_to_review', from: 'published', to: 'pending', reason: 'reported', note: `${reporters.length} người dùng khác nhau báo cáo` });
      created.events += 1;
    }
  }
  return created;
}
const startOfUtcDay = (ms) => ms - (ms % DAY_MS);

/**
 * Nạp hồ sơ ứng tuyển, ghi chú, lịch phỏng vấn và tin nhắn mẫu (v1.20). Khóa chống trùng là (tin, ứng viên): đơn đã có thì
 * bỏ qua hoàn toàn (không ghi đè, không thêm tin nhắn), nên chạy lại an toàn với mọi chế độ seed. Điểm chấm bằng thuật
 * toán (không gọi LLM hay embedding). Người dùng hoặc tin chưa có (ví dụ tin đã bị xóa) thì bỏ qua mục đó.
 */
export async function seedHiring() {
  const created = { applications: 0, messages: 0 };
  const now = Date.now();
  for (const entry of HIRING_SEED) {
    const [candidate, employer] = await Promise.all([
      User.findOne({ email: entry.candidate, role: 'candidate' }),
      User.findOne({ email: entry.employer, role: 'employer' }),
    ]);
    const job = employer && (await Job.findOne({ employerId: employer._id, title: entry.job, status: 'published' }));
    const profile = candidate && (await CandidateProfile.findOne({ userId: candidate._id }));
    if (!job || !profile || profile.cv?.parseStatus !== 'done') continue;
    if (await Application.exists({ jobId: job._id, candidateId: candidate._id })) continue;

    let score = null;
    try {
      score = await scoreMatch({ profile: profile.toObject(), job: job.toObject() });
    } catch {
      /* không chấm được thì để trống, giống lúc nộp đơn thật */
    }

    const submittedAt = now - entry.ageDays * DAY_MS;
    const steps = entry.path;
    // Các bước cách nhau đều đặn giữa lúc nộp và hiện tại
    const stepAt = (i) => new Date(submittedAt + ((now - submittedAt - HOUR_MS) * i) / Math.max(steps.length - 1, 1));
    const statusHistory = steps.map((status, i) => ({
      status,
      from: i === 0 ? null : steps[i - 1],
      actorRole: i === 0 || status === 'withdrawn' ? 'candidate' : 'employer',
      changedAt: stepAt(i),
      changedBy: i === 0 || status === 'withdrawn' ? candidate._id : employer._id,
      ...(status === 'rejected' && entry.rejectionReason && { reason: entry.rejectionReason }),
    }));

    let interview;
    if (entry.interview) {
      const i = entry.interview;
      interview = {
        scheduledAt: new Date(startOfUtcDay(now) + i.inDays * DAY_MS + i.hour * HOUR_MS),
        durationMinutes: 60,
        mode: i.mode,
        location: i.location,
        ...(i.message && { message: i.message }),
        confirmation: i.confirmation,
        ...(i.confirmation !== 'pending' && { respondedAt: new Date(now - HOUR_MS) }),
        ...(i.proposedInDays != null && { proposedAt: new Date(startOfUtcDay(now) + i.proposedInDays * DAY_MS + i.hour * HOUR_MS) }),
        ...(i.responseNote && { responseNote: i.responseNote }),
        rescheduleCount: 0,
        updatedAt: new Date(now - 2 * HOUR_MS),
      };
    }

    const application = await Application.create({
      jobId: job._id,
      candidateId: candidate._id,
      profileId: profile._id,
      status: steps.at(-1),
      coverLetter: 'Em rất quan tâm đến vị trí này và mong có cơ hội được trao đổi thêm với anh chị.',
      cvSnapshot: { ...profile.toObject().cv, parsedSnapshot: buildParsedSnapshot(candidate, profile) },
      ...(score && { matchScore: score.totalScore, matchBreakdown: score }),
      ...(entry.rating && { rating: entry.rating }),
      ...(entry.note && { employerNote: entry.note }),
      ...((entry.rating || entry.note) && { reviewedAt: new Date(now - DAY_MS) }),
      ...(entry.rejectionReason && { rejectionReason: entry.rejectionReason }),
      ...(interview && { interview }),
      statusHistory,
      createdAt: new Date(submittedAt),
    });
    await Job.updateOne({ _id: job._id }, { $inc: { applicationsCount: 1 } });
    created.applications += 1;

    const messages = entry.messages ?? [];
    for (const [i, [sender, body, read]] of messages.entries()) {
      const at = new Date(submittedAt + ((now - submittedAt - 2 * HOUR_MS) * (i + 1)) / (messages.length + 1));
      await ApplicationMessage.create({
        applicationId: application._id,
        senderId: sender === 'candidate' ? candidate._id : employer._id,
        senderRole: sender,
        body,
        ...(read && { readAt: new Date(at.getTime() + HOUR_MS) }),
        createdAt: at,
      });
      created.messages += 1;
    }

    // Thông báo cho những gì còn chưa đọc, để chuông thông báo có dữ liệu khi demo
    const unreadByCandidate = messages.filter(([sender, , read]) => sender === 'employer' && !read).length;
    const unreadByEmployer = messages.filter(([sender, , read]) => sender === 'candidate' && !read).length;
    const notes = [
      unreadByCandidate && {
        userId: candidate._id, type: 'application_message', title: 'Tin nhắn mới từ nhà tuyển dụng',
        message: `Bạn có ${unreadByCandidate > 1 ? `${unreadByCandidate} tin nhắn mới` : 'tin nhắn mới'} về vị trí "${job.title}".`,
        link: `/candidate/applications?app=${application.id}&tab=messages`,
        meta: { applicationId: application.id, jobId: String(job._id), count: unreadByCandidate },
      },
      unreadByEmployer && {
        userId: employer._id, type: 'application_message', title: `Tin nhắn mới từ ${candidate.fullName}`,
        message: `Bạn có ${unreadByEmployer > 1 ? `${unreadByEmployer} tin nhắn mới` : 'tin nhắn mới'} về vị trí "${job.title}".`,
        link: `/employer/applications/${application.id}`,
        meta: { applicationId: application.id, jobId: String(job._id), count: unreadByEmployer },
      },
      interview?.confirmation === 'pending' && {
        userId: candidate._id, type: 'interview', title: 'Bạn được mời phỏng vấn',
        message: `Nhà tuyển dụng mời bạn phỏng vấn vị trí "${job.title}". Hãy xác nhận hoặc đề nghị đổi giờ.`,
        link: `/candidate/applications?app=${application.id}`,
        meta: { applicationId: application.id, jobId: String(job._id) },
      },
      interview?.confirmation === 'reschedule_requested' && {
        userId: employer._id, type: 'interview', title: 'Ứng viên đề nghị đổi giờ phỏng vấn',
        message: `${candidate.fullName} đề nghị đổi giờ phỏng vấn vị trí "${job.title}". Hãy đặt lại lịch trong hồ sơ.`,
        link: `/employer/applications/${application.id}`,
        meta: { applicationId: application.id, jobId: String(job._id) },
      },
    ].filter(Boolean);
    if (notes.length) await Notification.insertMany(notes);
  }
  return created;
}

/** Chuyển tin của bộ đánh giá thành tin seed: bỏ `evalId`, gán employer vòng tròn, hạn nộp và trạng thái cố định. */
export function buildExtraJobs(extra, employerEmails) {
  if (!employerEmails.length) throw new Error('--full: seed_users.json không có employer nào để gắn tin');
  return extra.map(({ evalId, ...job }, i) => ({
    ...job,
    employerEmail: employerEmails[i % employerEmails.length],
    deadlineInDays: 21 + ((i * 7) % 40),
    status: EXTRA_STATUS_OVERRIDES[i] ?? 'published',
  }));
}

/** Đọc mọi file data/demo/jobs/*.json (theo thứ tự tên file) thành một mảng tin */
export function readDemoJobs(dir = DEMO_JOBS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => readJson(path.join(dir, name)));
}

/**
 * Tính lại các trường tìm kiếm không dấu (v1.12) cho mọi tin và công ty. Tin/công ty tạo qua model đã có sẵn nhờ
 * hook pre('validate'); hàm này bù cho dữ liệu cũ (tạo trước v1.12 hoặc sửa trực tiếp trong DB). Chạy lại an toàn.
 */
const AI_TOOLS_SEED_CANDIDATES = ['candidate1@demo.com', 'candidate2@demo.com', 'candidate3@demo.com'];
const AI_TOOLS_SEED_JOBS_PER_CANDIDATE = 2;
const SAMPLE_ANSWER =
  'Tôi từng phụ trách một dự án nhỏ có nhiều bên cùng tham gia. Tôi chia công việc thành các phần rõ ràng, trao đổi thường xuyên với nhóm ' +
  'và báo cáo tiến độ mỗi tuần. Kết quả là dự án hoàn thành đúng hạn và tôi rút ra bài học là cần báo sớm khi gặp vướng mắc.';

/**
 * Nạp kết quả mẫu của ba công cụ AI cho ứng viên (v1.21): với candidate1..3, mỗi người hai tin published của employer1,
 * một bản chấm CV, một thư xin việc, một bộ câu hỏi phỏng vấn kèm một lượt luyện tập. Dựng bằng thuật toán từ dữ liệu thật
 * (chế độ offline, không gọi LLM, không tốn lượt) nên xem được khi chưa có khóa AI; gắn `seeded=true`, `aiGenerated=false`.
 * Khóa chống trùng (userId, kind, jobId, seeded): chạy lại không tạo thêm, không ghi đè.
 */
export async function seedAiTools() {
  const created = { results: 0, practices: 0 };
  const employer = await User.findOne({ email: 'employer1@demo.com', role: 'employer' });
  if (!employer) return created;
  const jobs = await Job.find({ employerId: employer._id, status: 'published' })
    .sort({ createdAt: 1 })
    .limit(AI_TOOLS_SEED_JOBS_PER_CANDIDATE)
    .lean();
  const company = await Company.findOne({ ownerId: employer._id }).select('name').lean();
  const gate = { offline: 'sample' };

  for (const email of AI_TOOLS_SEED_CANDIDATES) {
    const user = await User.findOne({ email, role: 'candidate' }).lean();
    const profile = user && (await CandidateProfile.findOne({ userId: user._id }).lean());
    if (!profile || profile.cv?.parseStatus !== 'done') continue;
    for (const job of jobs) {
      const exists = (kind) => AiToolResult.exists({ userId: user._id, jobId: job._id, kind, seeded: true });
      const save = async (kind, result) => {
        const doc = await AiToolResult.create({
          userId: user._id,
          jobId: job._id,
          kind,
          inputHash: 'seed',
          aiGenerated: false,
          seeded: true,
          result: { ...result, jobTitle: job.title },
        });
        created.results++;
        return doc;
      };
      if (!(await exists('cv_review'))) {
        await save(
          'cv_review',
          await buildCvReview({ profile, job, contact: { email: user.email, phone: user.phone }, gate }),
        );
      }
      if (!(await exists('cover_letter'))) {
        await save(
          'cover_letter',
          await buildCoverLetter({
            profile,
            job,
            fullName: user.fullName,
            companyName: company?.name ?? '',
            tone: 'formal',
            length: 'medium',
            gate,
          }),
        );
      }
      if (!(await exists('interview_set'))) {
        const set = await save(
          'interview_set',
          await buildInterviewSet({ profile, job, companyName: company?.name ?? '', gate }),
        );
        const question = set.result.questions[0];
        const feedback = await buildAnswerFeedback({ job, question, answer: SAMPLE_ANSWER, gate });
        await InterviewPractice.create({
          userId: user._id,
          setId: set._id,
          questionId: question.id,
          answer: SAMPLE_ANSWER,
          answerHash: 'seed',
          result: { ...feedback.result, notes: feedback.notes },
          aiGenerated: false,
          aiFailureReason: feedback.aiFailureReason,
        });
        created.practices++;
      }
    }
  }
  return created;
}

/**
 * v1.23: số liệu mẫu cho trang admin "Theo dõi AI": 7 ngày gần nhất (giờ Việt Nam), mỗi ngày một dòng, cùng lượt dùng của
 * candidate1..3 hôm nay. Chỉ tạo ngày chưa có dòng nên chạy lại không ghi đè số liệu thật. Số liệu tất định, không gọi LLM.
 */
const SAMPLE_AI_TOOLS = [
  ['cv_review', 9, 0.12],
  ['cover_letter', 7, 0.1],
  ['interview_set', 5, 0.2],
  ['interview_answer', 11, 0.09],
  ['career_advice', 4, 0.25],
  ['cv_parse', 6, 0],
  ['match_explain', 8, 0.12],
];
export async function seedAiStats(days = 7) {
  const today = usageDay();
  let created = 0;
  for (let back = days - 1; back >= 0; back--) {
    const day = new Date(Date.parse(`${today}T00:00:00Z`) - back * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (await AiDailyStat.exists({ day })) continue;
    const factor = 1 + ((days - back) % 4) * 0.35; // vài ngày nhiều hơn để biểu đồ có hình
    const byTool = {};
    let calls = 0;
    for (const [tool, base, templateRate] of SAMPLE_AI_TOOLS) {
      const toolCalls = Math.round(base * factor);
      const results = tool === 'cv_parse' ? 0 : toolCalls;
      byTool[tool] = { calls: toolCalls, results, templates: Math.round(results * templateRate) };
      calls += toolCalls;
    }
    await AiDailyStat.create({
      day,
      calls,
      byTool,
      failures: { quota: back === 2 ? 3 : 0, overloaded: back % 3 === 0 ? 2 : 0, config: 0, invalid_output: back % 2 ? 1 : 0 },
      blocked: { budget: 0, disabled: 0 },
      expiresAt: new Date(Date.now() + PRIVACY.AI_STATS_TTL_DAYS * 24 * 60 * 60 * 1000),
    });
    created++;
    if (back === 0) {
      const users = await User.find({ email: { $in: ['candidate1@demo.com', 'candidate2@demo.com', 'candidate3@demo.com'] } }).select('_id');
      const expiresAt = new Date(Date.now() + PRIVACY.AI_USER_DAILY_TTL_DAYS * 24 * 60 * 60 * 1000);
      await Promise.all(
        users.map((u, i) => AiUserDaily.updateOne({ userId: u._id, day }, { $setOnInsert: { calls: 9 - i * 3, expiresAt } }, { upsert: true })),
      );
    }
  }
  return { days: created };
}

/**
 * v1.25: ví điểm mẫu cho candidate1 (đã nạp một gói, đã tiêu vài lượt, một lượt được hoàn) và candidate2 (một gói nhỏ, một đơn
 * thất bại, một đơn đang chờ). Mã đơn và giữ chỗ cố định nên chạy lại không trùng; sổ cái đi qua đúng hàm ghi sổ của hệ thống
 * (cùng khóa chống lặp) nên `npm run wallet:verify` vẫn khớp.
 */
const SEED_ID = (n) => new mongoose.Types.ObjectId(`64b00000000000000000${String(n).padStart(4, '0')}`);
export async function seedWallet() {
  const result = { orders: 0, entries: 0 };
  const owners = await User.find({ email: { $in: ['candidate1@demo.com', 'candidate2@demo.com'] } }).select('email');
  const userOf = (email) => owners.find((u) => u.email === email)?._id;
  const day = 24 * 60 * 60 * 1000;

  const seedOrder = async (n, userId, packageId, status, ageDays) => {
    const _id = SEED_ID(n);
    if (!userId || (await WalletOrder.exists({ _id }))) return null;
    const pkg = getPackage(packageId);
    const at = new Date(Date.now() - ageDays * day);
    await WalletOrder.collection.insertOne({
      _id,
      userId,
      packageId,
      amountVnd: pkg.amountVnd,
      points: pkg.points,
      bonusPoints: pkg.bonusPoints,
      status,
      provider: 'mock',
      txnRef: String(_id),
      ...(status === 'success' && { paidAt: at, gatewayTxnId: `MOCKSEED${n}` }),
      expiresAt: status === 'pending' ? new Date(Date.now() + 30 * 60 * 1000) : new Date(at.getTime() + 15 * 60 * 1000),
      createdAt: at,
      updatedAt: at,
    });
    result.orders++;
    if (status === 'success') {
      const base = { userId, refType: 'order', refId: String(_id) };
      result.entries += (await applyEntry({ ...base, type: 'topup', points: pkg.points, key: `topup:${_id}` })).created ? 1 : 0;
      if (pkg.bonusPoints) {
        result.entries += (await applyEntry({ ...base, type: 'bonus', points: pkg.bonusPoints, key: `bonus:${_id}`, reason: 'Điểm thưởng theo gói nạp' })).created ? 1 : 0;
      }
    }
    return _id;
  };

  // một lượt tiêu: giữ chỗ đã chốt (hoặc đã hoàn) và dòng sổ cái tương ứng
  const seedSpend = async (n, userId, tool, refunded) => {
    const _id = SEED_ID(n);
    if (!userId || (await WalletHold.exists({ _id }))) return;
    const points = priceOf(tool);
    await WalletHold.collection.insertOne({
      _id,
      userId,
      tool,
      source: 'points',
      points,
      status: refunded ? 'released' : 'committed',
      lockKey: `seed-hold-${n}`,
      finishedAt: new Date(),
      expireAt: new Date(Date.now() + 30 * day),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const base = { userId, refType: 'hold', refId: String(_id), tool };
    result.entries += (await applyEntry({ ...base, type: 'spend', points: -points, key: `spend:${_id}` })).created ? 1 : 0;
    if (refunded) result.entries += (await applyEntry({ ...base, type: 'refund', points, key: `refund:${_id}` })).created ? 1 : 0;
  };

  const c1 = userOf('candidate1@demo.com');
  const c2 = userOf('candidate2@demo.com');
  await seedOrder(1, c1, 'p50', 'success', 5);
  await seedSpend(11, c1, 'cover_letter', false);
  await seedSpend(12, c1, 'cv_review', true); // AI lỗi: đã hoàn
  await seedSpend(13, c1, 'interview_set', false);
  await seedOrder(2, c2, 'p20', 'success', 2);
  await seedOrder(3, c2, 'p100', 'failed', 1);
  await seedOrder(4, c2, 'p50', 'pending', 0);
  return result;
}

export async function backfillSearchFields() {
  const ops = (docs, fields) =>
    docs.map((doc) => ({
      updateOne: { filter: { _id: doc._id }, update: { $set: Object.fromEntries(fields.map(([to, from]) => [to, foldText(doc[from])])) } },
    }));
  const [jobs, companies] = await Promise.all([
    Job.find({}).select('title description').lean(),
    Company.find({}).select('name description').lean(),
  ]);
  if (jobs.length) {
    await Job.bulkWrite(ops(jobs, [['titleSearch', 'title'], ['descriptionSearch', 'description']]));
  }
  if (companies.length) {
    await Company.bulkWrite(ops(companies, [['nameSearch', 'name'], ['descriptionSearch', 'description']]));
  }
  await backfillCities();
  return { jobs: jobs.length, companies: companies.length };
}

/** v1.17: đưa thành phố cũ/viết tắt ("TP.HCM", "Sài Gòn"...) về tên chuẩn; tên không nhận ra được thì giữ nguyên. Chạy lại an toàn. */
export async function backfillCities() {
  const ops = (docs) =>
    docs.flatMap((doc) => {
      const city = doc.city && normalizeCity(doc.city);
      return city && city !== doc.city ? [{ updateOne: { filter: { _id: doc._id }, update: { $set: { city } } } }] : [];
    });
  const [jobs, companies] = await Promise.all([Job.find({}).select('city').lean(), Company.find({}).select('city').lean()]);
  const jobOps = ops(jobs);
  const companyOps = ops(companies);
  if (jobOps.length) await Job.bulkWrite(jobOps);
  if (companyOps.length) await Company.bulkWrite(companyOps);
  return { jobs: jobOps.length, companies: companyOps.length };
}

export async function seed({
  reset = false,
  full = false,
  demo = false,
  usersFile = DEFAULT_USERS_FILE,
  jobsFile = DEFAULT_JOBS_FILE,
  extraJobsFile = EXTRA_JOBS_FILE,
  demoUsersFile = DEMO_USERS_FILE,
  demoJobsDir = DEMO_JOBS_DIR,
} = {}) {
  const users = readJson(usersFile);
  const jobs = readJson(jobsFile);
  if (full) {
    const employers = users.filter((u) => u.role === 'employer').map((u) => u.email);
    jobs.push(...buildExtraJobs(readJson(extraJobsFile), employers));
  }
  // --full rải tin theo employer của bộ mặc định (đã tính ở trên), nên nạp demo sau cùng
  if (demo) {
    users.push(...readJson(demoUsersFile));
    jobs.push(...readDemoJobs(demoJobsDir));
  }
  const summary = { createdUsers: [], skippedUsers: [], createdJobs: [], skippedJobs: [] };

  if (reset) {
    await Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));
  }
  // Employer phải có trước để tin gắn được vào công ty
  for (const entry of users) await seedUser(entry, summary);
  for (const entry of jobs) await seedJob(entry, summary);
  Object.assign(summary, { engagement: await seedEngagement(), hiring: await seedHiring(),
    moderation: await seedModeration(),
    aiTools: await seedAiTools(),
    aiStats: await seedAiStats(),
    wallet: await seedWallet(),
    images: await seedCompanyImages(),
  });
  await backfillSearchFields();
  return summary;
}

/**
 * Tính embedding cho tin và hồ sơ còn thiếu hoặc lỗi thời (hash không khớp nội dung), theo lô EMBED_BATCH_SIZE.
 * Lô nào lỗi thì đếm vào `failed` và đi tiếp. `onProgress({ kind, done, total })` được gọi sau mỗi lô.
 * Không bao giờ ghi nội dung tin/hồ sơ ra ngoài.
 */
export async function embedSeedData({ onProgress = () => {}, batchSize = EMBED_BATCH_SIZE } = {}) {
  const targets = [
    {
      kind: 'jobs',
      docs: await Job.find({}).select('+embedding').lean(),
      textOf: buildJobText,
      vectorField: 'embedding',
      model: Job,
    },
    {
      kind: 'profiles',
      docs: await CandidateProfile.find({}).select('+profileEmbedding').lean(),
      textOf: buildProfileText,
      vectorField: 'profileEmbedding',
      model: CandidateProfile,
    },
  ];

  const stats = {};
  for (const { kind, docs, textOf, vectorField, model } of targets) {
    const todo = docs
      .map((doc) => ({ doc, text: textOf(doc) }))
      .filter(({ doc, text }) => text && (!hasVector(doc[vectorField]) || doc.embeddingHash !== hashOf(text)));
    stats[kind] = { total: docs.length, embedded: 0, failed: 0, upToDate: docs.length - todo.length };

    for (let i = 0; i < todo.length; i += batchSize) {
      const batch = todo.slice(i, i + batchSize);
      try {
        const vectors = await embedTexts(batch.map((b) => b.text));
        await model.bulkWrite(
          batch.map(({ doc, text }, j) => ({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: { [vectorField]: vectors[j], embeddingHash: hashOf(text) } },
            },
          })),
        );
        stats[kind].embedded += batch.length;
      } catch (err) {
        stats[kind].failed += batch.length;
        console.error(`  Lô ${kind} lỗi: ${redactSecrets(err.message)}`);
      }
      onProgress({ kind, done: Math.min(i + batchSize, todo.length), total: todo.length });
    }
  }
  return stats;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  try {
    const { host, name } = describeConnection(await connectDB());
    console.log(`Đã kết nối MongoDB: host=${host}, database=${name}`);
    const reset = process.argv.includes('--reset');
    if (reset) console.log('--reset: xóa dữ liệu cũ trước khi nạp');

    const full = process.argv.includes('--full');
    if (full) console.log('--full: nạp thêm tin từ data/eval/jobs_extra.json');

    const demo = process.argv.includes('--demo');
    if (demo) console.log('--demo: nạp thêm công ty và tin từ data/demo/');

    const s = await seed({ reset, full, demo });
    console.log(`Tài khoản: tạo ${s.createdUsers.length}, bỏ qua ${s.skippedUsers.length} (đã tồn tại)`);
    console.log(`Tin tuyển dụng: tạo ${s.createdJobs.length}, bỏ qua ${s.skippedJobs.length} (đã tồn tại)`);
    console.log(`Theo dõi công ty: tạo ${s.engagement.follows}; tìm kiếm đã lưu: tạo ${s.engagement.searches} (chạy npm run alerts:run để thử báo việc mới)`);
    console.log(`Hồ sơ ứng tuyển mẫu: tạo ${s.hiring.applications} đơn, ${s.hiring.messages} tin nhắn`);
    console.log(`Kiểm duyệt mẫu: tạo ${s.moderation.jobs} tin, ${s.moderation.events} sự kiện, ${s.moderation.reports} báo cáo (tài khoản employer-unverified@demo.com / Employer@123)`);
    console.log(`Ảnh mẫu: ${s.images.logos} logo, ${s.images.covers} ảnh bìa mới (vẽ tự động, không đưa vào Git)`);
    console.log(`Kết quả công cụ AI mẫu: tạo ${s.aiTools.results} kết quả, ${s.aiTools.practices} lượt luyện tập (không gọi AI)`);

    if (process.argv.includes('--embed')) {
      console.log(`--embed: tính embedding theo lô ${EMBED_BATCH_SIZE} (provider hiện hành)`);
      const e = await embedSeedData({
        onProgress: ({ kind, done, total }) => console.log(`  ${kind === 'jobs' ? 'Tin' : 'Hồ sơ'}: ${done}/${total}`),
      });
      for (const [kind, st] of Object.entries(e)) {
        console.log(
          `${kind === 'jobs' ? 'Tin' : 'Hồ sơ'}: nhúng ${st.embedded}, đã đủ ${st.upToDate}, lỗi ${st.failed} (tổng ${st.total})`,
        );
        if (st.failed) process.exitCode = 1;
      }
    }
    await disconnectDB();
  } catch (err) {
    console.error(`Seed thất bại: ${redactSecrets(err.message)}`);
    process.exitCode = 1;
    await disconnectDB().catch(() => {});
  }
}
