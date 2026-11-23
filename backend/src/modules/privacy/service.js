import fs from 'node:fs/promises';
import { PRIVACY, WALLET } from '../../config/constants.js';
import {
  AiToolResult,
  AiUsage,
  AiUserDaily,
  AlertToken,
  Application,
  ApplicationMessage,
  CandidateProfile,
  CareerAdvice,
  Company,
  CompanyFollow,
  InterviewPractice,
  Job,
  JobAlert,
  MatchResult,
  Notification,
  RefreshToken,
  SavedSearch,
  User,
  VerificationToken,
} from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { resolveStoredPath } from '../../utils/files.js';
import { comparePassword } from '../../utils/hash.js';
import { removeImage } from '../../utils/images.js';
import { hasRecentLogin } from '../auth/service.js';
import { removeLicenseFile } from '../companies/verification.js';
import { createNotification } from '../notifications/service.js';
import { closeWallet, exportWalletData } from '../wallet/service.js';

// Xuất dữ liệu cá nhân và xóa tài khoản. Không ghi nội dung CV, thư, tin nhắn vào log:
// file này không có console.* nào.

const ACTIVE_APPLICATION = ['submitted', 'viewed', 'shortlisted', 'interview', 'offered'];
const OPEN_JOB = ['draft', 'pending', 'published'];

/** Xác thực lại: có mật khẩu thì phải nhập đúng; tài khoản chỉ có Google thì phải vừa đăng nhập */
async function reauthenticate(userId, password) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || user.deletedAt) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');
  if (user.passwordHash) {
    if (!password) {
      throw new ApiError('VALIDATION_ERROR', 'Vui lòng nhập mật khẩu để xác nhận', [
        { field: 'password', message: 'Mật khẩu là bắt buộc' },
      ]);
    }
    if (!(await comparePassword(password, user.passwordHash))) throw new ApiError('UNAUTHORIZED', 'Mật khẩu không đúng');
  } else if (!hasRecentLogin(user)) {
    throw new ApiError('REAUTH_REQUIRED', 'Để tiếp tục, bạn cần đăng nhập lại bằng Google rồi thử lại ngay');
  }
  return user;
}

const idOf = (doc) => String(doc._id);

// ---------------------------------------------------------------------------------------------------------------------
// Xuất dữ liệu
// ---------------------------------------------------------------------------------------------------------------------

async function candidateData(user) {
  const [profile, applications, savedSearches, follows, aiResults, practices, advices] = await Promise.all([
    CandidateProfile.findOne({ userId: user._id }).select('+cv.parsed').lean(),
    Application.find({ candidateId: user._id }).sort({ createdAt: -1 }).lean(),
    SavedSearch.find({ userId: user._id }).lean(),
    CompanyFollow.find({ userId: user._id }).lean(),
    AiToolResult.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    InterviewPractice.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    CareerAdvice.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
  ]);

  const [jobs, companies] = await Promise.all([
    Job.find({ _id: { $in: applications.map((a) => a.jobId) } }).select('title companyId').lean(),
    Company.find({ _id: { $in: follows.map((f) => f.companyId) } }).select('name').lean(),
  ]);
  const jobTitle = new Map(jobs.map((j) => [idOf(j), j.title]));
  const companyName = new Map(companies.map((c) => [idOf(c), c.name]));

  if (profile?.cv) delete profile.cv.storedPath;
  return {
    profile: profile ?? null,
    savedJobs: profile?.savedJobIds ?? [],
    // employerNote, rating, reviewedAt là dữ liệu nội bộ của nhà tuyển dụng: không xuất (v1.20)
    applications: applications.map((a) => ({
      id: idOf(a),
      jobId: String(a.jobId),
      jobTitle: jobTitle.get(String(a.jobId)) ?? null,
      status: a.status,
      coverLetter: a.coverLetter ?? null,
      matchScore: a.matchScore ?? null,
      matchBreakdown: a.matchBreakdown ?? null,
      rejectionReason: a.rejectionReason ?? null,
      interview: a.interview ?? null,
      statusHistory: a.statusHistory ?? [],
      cv: a.cvSnapshot
        ? { originalName: a.cvSnapshot.originalName ?? null, uploadedAt: a.cvSnapshot.uploadedAt ?? null, parsed: a.cvSnapshot.parsedSnapshot ?? null }
        : null,
      createdAt: a.createdAt,
    })),
    savedSearches,
    followedCompanies: follows.map((f) => ({ companyId: String(f.companyId), name: companyName.get(String(f.companyId)) ?? null, followedAt: f.createdAt })),
    aiResults,
    interviewPractices: practices,
    careerAdvices: advices,
    wallet: await exportWalletData(user._id, WALLET.EXPORT_TX_MAX), // v1.25: số dư, giao dịch, đơn nạp
  };
}

async function employerData(user) {
  const [company, jobs] = await Promise.all([
    Company.findOne({ ownerId: user._id }).lean(),
    Job.find({ employerId: user._id }).select('-embedding').lean(),
  ]);
  if (company?.businessLicense) delete company.businessLicense.storedPath;
  return { company: company ?? null, jobs };
}

/** POST /auth/account/export: JSON dữ liệu của chính người gọi */
export async function exportData(authUser, { password }) {
  const user = await reauthenticate(authUser.id, password);
  const [notifications, messages] = await Promise.all([
    Notification.find({ userId: user._id }).sort({ createdAt: -1 }).limit(PRIVACY.EXPORT_NOTIFICATIONS_MAX).lean(),
    ApplicationMessage.find({ senderId: user._id }).sort({ createdAt: 1 }).lean(),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    termsVersion: user.termsVersion ?? null,
    account: {
      id: idOf(user),
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? null,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt ?? null,
      emailVerified: user.emailVerified === true,
      phoneVerified: user.phoneVerified === true,
      loginMethods: { password: Boolean(user.passwordHash), google: Boolean(user.googleId) },
      notificationSettings: user.notificationSettings ?? null,
      termsVersion: user.termsVersion ?? null,
      termsAcceptedAt: user.termsAcceptedAt ?? null,
    },
    notifications,
    messages: messages.map((m) => ({ applicationId: String(m.applicationId), senderRole: m.senderRole, body: m.body, createdAt: m.createdAt })),
    ...(user.role === 'candidate' && (await candidateData(user))),
    ...(user.role === 'employer' && (await employerData(user))),
  };

  const json = JSON.stringify(data, (key, value) => (key === '__v' ? undefined : value), 2);
  return { filename: `du-lieu-ca-nhan-${data.exportedAt.slice(0, 10)}.json`, json };
}

// ---------------------------------------------------------------------------------------------------------------------
// Xóa tài khoản
// ---------------------------------------------------------------------------------------------------------------------

async function removeStoredFile(storedPath) {
  const file = resolveStoredPath(storedPath);
  if (file) await fs.rm(file, { force: true }).catch(() => {});
}

async function eraseCandidate(user) {
  const [profile, applications] = await Promise.all([
    CandidateProfile.findOne({ userId: user._id }).select('cv.storedPath').lean(),
    Application.find({ candidateId: user._id }).select('cvSnapshot.storedPath').lean(),
  ]);
  const files = new Set([profile?.cv?.storedPath, ...applications.map((a) => a.cvSnapshot?.storedPath)].filter(Boolean));
  await Promise.all([...files].map(removeStoredFile));

  const now = new Date();
  // Lịch phỏng vấn đang hẹn thì hủy, đơn đang xử lý thì coi như ứng viên rút
  await Application.updateMany(
    { candidateId: user._id, status: { $in: ACTIVE_APPLICATION }, 'interview.scheduledAt': { $exists: true } },
    { $set: { 'interview.confirmation': 'cancelled' } },
  );
  await Application.updateMany(
    { candidateId: user._id, status: { $in: ACTIVE_APPLICATION } },
    {
      $set: { status: 'withdrawn' },
      $push: { statusHistory: { status: 'withdrawn', actorRole: 'candidate', reason: 'account_deleted', changedAt: now } },
    },
  );
  // Ẩn danh mọi đơn: bỏ thư giới thiệu, CV đã chụp và phân tích điểm dựa trên CV; giữ trạng thái và lịch sử cho nhà tuyển dụng
  await Application.updateMany(
    { candidateId: user._id },
    { $set: { cvSnapshot: { parseStatus: 'none' } }, $unset: { coverLetter: '', matchBreakdown: '' } },
  );

  await Promise.all([
    CandidateProfile.deleteOne({ userId: user._id }),
    profile ? MatchResult.deleteMany({ profileId: profile._id }) : null, // không bao giờ lọc theo giá trị undefined
    CareerAdvice.deleteMany({ userId: user._id }),
    AiToolResult.deleteMany({ userId: user._id }),
    InterviewPractice.deleteMany({ userId: user._id }),
    SavedSearch.deleteMany({ userId: user._id }),
    JobAlert.deleteMany({ userId: user._id }),
    AlertToken.deleteMany({ userId: user._id }),
    CompanyFollow.deleteMany({ userId: user._id }),
  ]);
}

async function eraseEmployer(user) {
  const jobs = await Job.find({ employerId: user._id }).select('title').lean();
  const jobIds = jobs.map((j) => j._id);
  const titleOf = new Map(jobs.map((j) => [idOf(j), j.title]));

  await Job.updateMany({ employerId: user._id, status: { $in: OPEN_JOB } }, { $set: { status: 'closed' } });

  // Đơn đang xử lý trên các tin này chuyển sang trạng thái kết thúc kèm lý do (không có trạng thái "đã đóng" riêng)
  const open = await Application.find({ jobId: { $in: jobIds }, status: { $in: ACTIVE_APPLICATION } })
    .select('candidateId jobId')
    .lean();
  const now = new Date();
  await Application.updateMany(
    { jobId: { $in: jobIds }, status: { $in: ACTIVE_APPLICATION }, 'interview.scheduledAt': { $exists: true } },
    { $set: { 'interview.confirmation': 'cancelled' } },
  );
  await Application.updateMany(
    { jobId: { $in: jobIds }, status: { $in: ACTIVE_APPLICATION } },
    {
      $set: { status: 'rejected', rejectionReason: PRIVACY.EMPLOYER_CLOSED_REASON },
      $push: { statusHistory: { status: 'rejected', actorRole: 'employer', reason: PRIVACY.EMPLOYER_CLOSED_REASON, changedAt: now } },
    },
  );
  // Ghi chú và đánh giá nội bộ là dữ liệu của nhà tuyển dụng này
  await Application.updateMany({ jobId: { $in: jobIds } }, { $unset: { employerNote: '', rating: '', reviewedAt: '' } });

  for (const a of open) {
    await createNotification({
      userId: a.candidateId,
      type: 'application_status',
      title: 'Đơn ứng tuyển đã đóng',
      message: `Nhà tuyển dụng đã đóng tài khoản nên đơn ứng tuyển vị trí "${titleOf.get(String(a.jobId)) ?? 'đã nộp'}" được đóng lại.`,
      link: '/candidate/applications',
      meta: { applicationId: idOf(a), jobId: String(a.jobId), status: 'rejected' },
    });
  }

  const company = await Company.findOne({ ownerId: user._id }).select('logoPath coverPath businessLicense.storedPath').lean();
  if (company) {
    await Promise.all([
      removeImage('logos', company.logoPath),
      removeImage('covers', company.coverPath),
      removeLicenseFile(company.businessLicense?.storedPath).catch(() => {}),
    ]);
    await Company.updateOne(
      { _id: company._id },
      {
        $set: { verificationStatus: 'unverified' },
        $unset: {
          contactEmail: '',
          taxCode: '',
          website: '',
          address: '',
          logoPath: '',
          coverPath: '',
          businessLicense: '',
          imageChanges: '',
          verificationNote: '',
          verificationSubmittedAt: '',
          verificationReviewedAt: '',
          verificationReviewedBy: '',
        },
      },
    );
  }
}

/** POST /auth/account/delete. Chạy lại an toàn: xóa dữ liệu trước, ẩn danh tài khoản và thu hồi token sau cùng */
export async function deleteAccount(authUser, { confirmEmail, password }) {
  if (confirmEmail !== String(authUser.email).toLowerCase()) {
    throw new ApiError('VALIDATION_ERROR', 'Email xác nhận không khớp với email tài khoản', [
      { field: 'confirmEmail', message: 'Email xác nhận không khớp với email tài khoản' },
    ]);
  }
  const user = await reauthenticate(authUser.id, password);

  if (user.role === 'admin') {
    const others = await User.countDocuments({ role: 'admin', status: 'active', deletedAt: { $exists: false }, _id: { $ne: user._id } });
    if (!others) throw new ApiError('FORBIDDEN', 'Hệ thống phải còn ít nhất một quản trị viên, bạn không thể xóa tài khoản admin cuối cùng');
  }

  if (user.role === 'candidate') {
    await closeWallet(user._id); // v1.25: số dư còn lại bị xóa (không hoàn tiền), sổ cái giữ lại
    await eraseCandidate(user);
  }
  if (user.role === 'employer') await eraseEmployer(user);

  await Promise.all([
    removeImage('avatars', user.avatarPath),
    ApplicationMessage.updateMany({ senderId: user._id }, { $set: { body: PRIVACY.DELETED_MESSAGE } }),
    Notification.deleteMany({ userId: user._id }),
    AiUsage.deleteMany({ userId: user._id }),
    AiUserDaily.deleteMany({ userId: user._id }),
    VerificationToken.deleteMany({ userId: user._id }),
  ]);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        fullName: PRIVACY.DELETED_NAME[user.role],
        email: `deleted-${idOf(user)}@deleted.invalid`,
        status: 'locked',
        deletedAt: new Date(),
        emailVerified: false,
        phoneVerified: false,
        notificationSettings: { inApp: false, email: false, newJobs: false, followedCompanies: false },
      },
      $unset: {
        passwordHash: '',
        googleId: '',
        phone: '',
        avatarPath: '',
        lastLoginAt: '',
        emailVerifiedAt: '',
        phoneVerifiedAt: '',
        termsVersion: '',
        termsAcceptedAt: '',
      },
    },
  );
  // Thu hồi mọi phiên sau cùng: tài khoản đã khóa nên refresh token mới cũng không cấp được
  await RefreshToken.deleteMany({ userId: user._id });

  return { message: 'Tài khoản và dữ liệu cá nhân của bạn đã được xóa' };
}
