import path from 'node:path';
import { env } from '../../config/env.js';
import { APPLICATION_STATUS, LIMITS } from '../../config/constants.js';
import { Application, CandidateProfile, Company, Job, User } from '../../models/index.js';
import { assertEmailVerified, assertPhoneVerified } from '../../middlewares/verified.js';
import { ApiError } from '../../utils/ApiError.js';
import { countBy, skipOf } from '../../utils/queryHelpers.js';
import { resolveStoredPath } from '../../utils/files.js';
import { buildMeta } from '../../utils/response.js';
import { toDto } from '../../utils/serialize.js';
import { toCompanySummary } from '../companies/dto.js';
import { getApplicationMatch, scoreApplication } from '../ai/matching.js';
import { getOwnedJob } from '../jobs/service.js';
import { createNotification } from '../notifications/service.js';
import { forCandidate, isOwner, loadAuthorized } from './access.js';
import { buildInterview, notifyInterviewScheduled } from './interviews.js';
import { messageStats } from './messages.js';

// Chuyển trạng thái do employer thực hiện (mục 5.4, v1.20): chỉ đi tới; hired / rejected / withdrawn là trạng thái cuối
export const EMPLOYER_TRANSITIONS = {
  submitted: ['viewed', 'shortlisted', 'interview', 'rejected'],
  viewed: ['shortlisted', 'interview', 'rejected'],
  shortlisted: ['interview', 'rejected'],
  interview: ['offered', 'hired', 'rejected'],
  offered: ['hired', 'rejected'],
};
export const WITHDRAWABLE = ['submitted', 'viewed', 'shortlisted', 'interview', 'offered'];

// Nội dung thông báo gửi ứng viên khi đơn đổi trạng thái (v1.13): tiêu đề ngắn, câu chữ nêu rõ việc gì đã xảy ra
const STATUS_NOTICE = {
  viewed: {
    title: 'Nhà tuyển dụng đã xem hồ sơ của bạn',
    message: (job, company) => `${company} đã mở hồ sơ ứng tuyển vị trí "${job}" của bạn.`,
  },
  shortlisted: {
    title: 'Hồ sơ của bạn vào danh sách ngắn',
    message: (job, company) => `${company} đã đưa hồ sơ của bạn cho vị trí "${job}" vào danh sách ngắn. Hãy theo dõi để nhận lời mời tiếp theo.`,
  },
  interview: {
    title: 'Bạn được mời phỏng vấn',
    message: (job, company) => `${company} mời bạn phỏng vấn vị trí "${job}". Hãy kiểm tra email và số điện thoại để nhận lịch cụ thể.`,
  },
  offered: {
    title: 'Bạn nhận được đề nghị làm việc',
    message: (job, company) => `${company} gửi đề nghị làm việc vị trí "${job}" cho bạn. Hãy kiểm tra tin nhắn trong hồ sơ để biết chi tiết.`,
  },
  hired: {
    title: 'Chúc mừng, bạn đã trúng tuyển',
    message: (job, company) => `${company} đã chọn bạn cho vị trí "${job}". Nhà tuyển dụng sẽ liên hệ về các bước tiếp theo.`,
  },
  rejected: {
    title: 'Đơn ứng tuyển chưa được chọn',
    message: (job, company, reason) =>
      `${company} chưa chọn hồ sơ của bạn cho vị trí "${job}" lần này.${reason ? ` Lý do: ${reason}` : ' Bạn có thể xem thêm các việc làm phù hợp khác.'}`,
  },
};

function jobSummary(job, company) {
  return {
    id: job.id,
    title: job.title,
    category: job.category,
    level: job.level,
    employmentType: job.employmentType,
    workMode: job.workMode,
    city: job.city,
    salary: job.salary,
    deadline: job.deadline,
    status: job.status,
    companyId: job.companyId,
    company: toCompanySummary(company),
  };
}

async function jobSummaries(jobIds) {
  const jobs = await Job.find({ _id: { $in: jobIds } });
  const companies = await Company.find({ _id: { $in: jobs.map((j) => j.companyId) } });
  const companyById = new Map(companies.map((c) => [c.id, c]));
  return new Map(jobs.map((j) => [j.id, jobSummary(j, companyById.get(String(j.companyId)))]));
}

/** CVParsed tại thời điểm nộp, dựng từ hồ sơ hiện tại (đã gồm phần người dùng chỉnh sửa) */
export function buildParsedSnapshot(user, profile) {
  const p = profile.toObject();
  return {
    // headline là trường thêm ngoài CVParsed: buildProfileText cần nó để chấm lại đúng CV đã nộp
    headline: p.headline ?? null,
    fullName: user.fullName,
    email: user.email,
    phone: null,
    location: p.location ?? null,
    summary: p.about ?? null,
    skills: p.skills ?? [],
    experiences: p.experiences ?? [],
    educations: p.educations ?? [],
    certifications: p.certifications ?? [],
    languages: p.languages ?? [],
    totalYearsExperience: p.totalYearsExperience ?? null,
    highestEducation: p.highestEducation ?? null,
    primaryField: p.primaryField ?? null,
    seniority: p.seniority ?? null,
    confidence: p.cv?.aiConfidence ?? null,
    warnings: p.cv?.warnings ?? [],
  };
}

export async function apply(user, jobId, { coverLetter, phone }) {
  assertEmailVerified(user);
  const job = await Job.findById(jobId).select('+embedding');
  if (!job) throw new ApiError('NOT_FOUND', 'Không tìm thấy tin tuyển dụng');

  const profile = await CandidateProfile.findOne({ userId: user.id }).select('+profileEmbedding');
  if (!profile || profile.cv?.parseStatus !== 'done') {
    throw new ApiError('CV_REQUIRED', 'Bạn cần tải lên CV và hoàn tất phân tích trước khi ứng tuyển');
  }
  if (job.status !== 'published' || job.deadline.getTime() < Date.now()) {
    throw new ApiError('JOB_NOT_OPEN', 'Tin tuyển dụng đã đóng hoặc đã hết hạn nộp hồ sơ');
  }
  if (await Application.exists({ jobId: job._id, candidateId: user.id })) {
    throw new ApiError('DUPLICATE_APPLICATION', 'Bạn đã ứng tuyển tin này rồi');
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if ((await Application.countDocuments({ candidateId: user.id, createdAt: { $gte: since } })) >= LIMITS.APPLICATIONS_PER_DAY) {
    throw new ApiError('RATE_LIMITED', `Bạn chỉ có thể nộp tối đa ${LIMITS.APPLICATIONS_PER_DAY} đơn ứng tuyển mỗi ngày`);
  }

  // v1.14: số điện thoại bắt buộc khi nộp đơn; thiếu thì lấy từ request và lưu vào hồ sơ
  if (!user.phone) {
    if (!phone) {
      throw new ApiError('PHONE_REQUIRED', 'Bạn cần nhập số điện thoại để nhà tuyển dụng liên hệ', [
        { field: 'phone', message: 'Số điện thoại là bắt buộc khi ứng tuyển' },
      ]);
    }
    await User.updateOne({ _id: user.id }, { phone, phoneVerified: false });
    user = { ...user, phone, phoneVerified: false };
  }
  assertPhoneVerified(user);

  // Lỗi AI không chặn việc nộp đơn: không chấm được thì matchScore để trống
  let score = null;
  try {
    score = await scoreApplication({ profile: profile.toObject(), job: job.toObject() });
  } catch (err) {
    if (!env.isTest) console.error(`Không chấm được điểm cho đơn ứng tuyển: ${err.message}`);
  }

  const now = new Date();
  let application;
  try {
    application = await Application.create({
      jobId: job._id,
      candidateId: user.id,
      profileId: profile._id,
      coverLetter,
      cvSnapshot: { ...profile.toObject().cv, parsedSnapshot: buildParsedSnapshot(user, profile) },
      ...(score && { matchScore: score.matchScore, matchBreakdown: score.matchBreakdown }),
      statusHistory: [{ status: 'submitted', from: null, actorRole: 'candidate', changedAt: now, changedBy: user.id }],
    });
  } catch (err) {
    // Hai request song song cùng vượt qua bước kiểm tra trùng: index unique chặn bản thứ hai
    if (err.code === 11000) throw new ApiError('DUPLICATE_APPLICATION', 'Bạn đã ứng tuyển tin này rồi');
    throw err;
  }

  await Job.updateOne({ _id: job._id }, { $inc: { applicationsCount: 1 } });
  await createNotification({
    userId: job.employerId,
    type: 'new_application',
    title: 'Có ứng viên mới',
    message: `${user.fullName} vừa ứng tuyển vị trí "${job.title}"${score ? `, điểm phù hợp ${score.matchScore}/100` : ''}.`,
    link: `/employer/applications/${application.id}`,
    meta: { applicationId: application.id, jobId },
  });
  return forCandidate(toDto(application));
}

export async function listMine(user, { status, page, limit }) {
  const filter = { candidateId: user.id };
  if (status) filter.status = status;

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .select('-cvSnapshot')
      .sort({ createdAt: -1 })
      .skip(skipOf({ page, limit }))
      .limit(limit),
    Application.countDocuments(filter),
  ]);
  const [jobs, stats] = await Promise.all([
    jobSummaries(applications.map((a) => a.jobId)),
    messageStats(applications.map((a) => a._id), 'candidate'),
  ]);
  const items = applications.map((a) => ({
    ...forCandidate(toDto(a)),
    job: jobs.get(String(a.jobId)) ?? null,
    messages: stats.get(a.id),
  }));
  return { items, meta: buildMeta({ page, limit, total }) };
}

export async function withdraw(user, id) {
  const application = await Application.findById(id);
  if (!application) throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn ứng tuyển');
  if (!isOwner(application.candidateId, user.id)) {
    throw new ApiError('FORBIDDEN', 'Bạn không phải chủ của đơn ứng tuyển này');
  }
  if (!WITHDRAWABLE.includes(application.status)) {
    throw new ApiError('INVALID_STATUS_TRANSITION', `Không thể rút đơn ở trạng thái "${application.status}"`);
  }

  const updated = await Application.findOneAndUpdate(
    { _id: id, status: application.status },
    {
      $set: {
        status: 'withdrawn',
        ...(application.interview?.scheduledAt && { 'interview.confirmation': 'cancelled' }),
      },
      $push: {
        statusHistory: { status: 'withdrawn', from: application.status, actorRole: 'candidate', changedAt: new Date(), changedBy: user.id },
      },
    },
    { new: true },
  ).select('-cvSnapshot');
  if (!updated) {
    throw new ApiError('INVALID_STATUS_TRANSITION', 'Trạng thái đơn vừa được thay đổi, vui lòng tải lại');
  }

  const job = await Job.findById(application.jobId).select('title employerId');
  if (job) {
    await createNotification({
      userId: job.employerId,
      type: 'application_status',
      title: 'Ứng viên đã rút đơn',
      message: `${user.fullName} đã rút đơn ứng tuyển vị trí "${job.title}".`,
      link: `/employer/applications/${id}`,
      meta: { applicationId: id, jobId: String(job._id), status: 'withdrawn' },
    });
  }
  return forCandidate(toDto(updated));
}

const LIST_ORDER = {
  score: { matchScore: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  // Đơn chưa chấm sao (thiếu trường) xếp cuối
  rating: { rating: -1, matchScore: -1, createdAt: -1 },
};

export async function listForJob(user, jobId, { status, minScore, minRating, sort, page, limit }) {
  const job = await getOwnedJob(jobId, user);

  const filter = { jobId };
  if (status) filter.status = status;
  if (minScore != null) filter.matchScore = { $gte: minScore };
  if (minRating != null) filter.rating = { $gte: minRating };
  // Đơn chưa có điểm (null) xếp cuối khi sắp theo điểm giảm dần
  const order = LIST_ORDER[sort] ?? LIST_ORDER.score;

  const [applications, total, statusCounts] = await Promise.all([
    Application.find(filter).select('-cvSnapshot').sort(order).skip(skipOf({ page, limit })).limit(limit),
    Application.countDocuments(filter),
    // Đếm theo trạng thái cho cả tin, không bị bộ lọc thu hẹp (dùng cho số trên cột kéo thả)
    countBy(Application, 'status', APPLICATION_STATUS, { jobId: job._id }),
  ]);

  const [users, profiles, stats] = await Promise.all([
    User.find({ _id: { $in: applications.map((a) => a.candidateId) } }),
    CandidateProfile.find({ _id: { $in: applications.map((a) => a.profileId) } }),
    messageStats(applications.map((a) => a._id), 'employer'),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const items = applications.map((a) => ({
    ...toDto(a),
    candidate: candidateSummary(userById.get(String(a.candidateId)), profileById.get(String(a.profileId))),
    messages: stats.get(a.id),
  }));
  return { items, meta: { ...buildMeta({ page, limit, total }), statusCounts } };
}

// Ứng viên đã ứng tuyển nên employer được thấy email/phone (mục 9)
function candidateSummary(user, profile) {
  const deleted = Boolean(user?.deletedAt); // v1.23: tài khoản đã xóa chỉ còn tên "Ứng viên đã xóa tài khoản", không email / số điện thoại
  return {
    userId: user?.id ?? null,
    profileId: profile?.id ?? null,
    deleted,
    fullName: user?.fullName ?? null,
    // v1.24: ảnh đại diện chỉ lộ cho nhà tuyển dụng của tin mà ứng viên đã nộp đơn (chỉ hai nơi gọi hàm này)
    avatarPath: deleted ? null : (user?.avatarPath ?? null),
    email: deleted ? null : (user?.email ?? null),
    phone: deleted ? null : (user?.phone ?? null),
    headline: profile?.headline ?? null,
    location: profile?.location ?? null,
    totalYearsExperience: profile?.totalYearsExperience ?? null,
    skills: profile?.skills ?? [],
  };
}

async function notifyStatusChange(application, job, status, reason) {
  const notice = STATUS_NOTICE[status];
  if (!notice) return;
  const company = await Company.findById(job.companyId).select('name');
  await createNotification({
    userId: application.candidateId,
    type: 'application_status',
    title: notice.title,
    message: notice.message(job.title, company?.name ?? 'Nhà tuyển dụng', reason),
    link: '/candidate/applications',
    meta: { applicationId: application.id, jobId: String(job._id), status },
  });
}

export async function getDetail(user, id) {
  let { application, job } = await loadAuthorized(id, user);
  const isEmployer = user.role === 'employer';

  // Employer mở lần đầu thì tự chuyển submitted -> viewed
  if (isEmployer && application.status === 'submitted') {
    const viewed = await Application.findOneAndUpdate(
      { _id: id, status: 'submitted' },
      {
        $set: { status: 'viewed' },
        $push: { statusHistory: { status: 'viewed', from: 'submitted', actorRole: 'employer', changedAt: new Date(), changedBy: user.id } },
      },
      { new: true },
    );
    if (viewed) {
      application = viewed;
      await notifyStatusChange(application, job, 'viewed');
    }
  }

  const [company, matchResult] = await Promise.all([
    Company.findById(job.companyId),
    // Employer mở đơn thì có nhận xét đầy đủ do LLM viết (được cache); không tính được thì trả bản lúc nộp
    getApplicationMatch(application, { withExplanation: isEmployer }).catch((err) => {
      if (!env.isTest) console.error(`Không tính được điểm chi tiết cho đơn ${id}: ${err.message}`);
      return null;
    }),
  ]);
  const stats = (await messageStats([application._id], user.role)).get(application.id);
  const dto = {
    ...toDto(application),
    job: jobSummary(job, company),
    matchResult: matchResult ?? application.matchBreakdown ?? null,
    messages: stats,
  };

  if (!isEmployer) return forCandidate(dto);
  const actorIds = [...new Set((application.statusHistory ?? []).map((h) => h.changedBy).filter(Boolean).map(String))];
  const [candidate, profile, actors] = await Promise.all([
    User.findById(application.candidateId),
    CandidateProfile.findById(application.profileId),
    User.find({ _id: { $in: actorIds } }).select('fullName'),
  ]);
  const actorName = new Map(actors.map((u) => [u.id, u.fullName]));
  dto.statusHistory = dto.statusHistory.map((h) => ({ ...h, changedByName: actorName.get(String(h.changedBy)) ?? null }));
  return { ...dto, candidate: candidateSummary(candidate, profile) };
}

export async function updateStatus(user, id, { status, employerNote, rejectionReason, interview }) {
  const { application, job } = await loadAuthorized(id, user);

  if (!EMPLOYER_TRANSITIONS[application.status]?.includes(status)) {
    throw new ApiError(
      'INVALID_STATUS_TRANSITION',
      `Không thể chuyển đơn từ "${application.status}" sang "${status}"`,
    );
  }

  const now = new Date();
  const set = { status };
  if (employerNote !== undefined) {
    set.employerNote = employerNote;
    set.reviewedAt = now;
  }
  if (status === 'rejected') {
    if (rejectionReason) set.rejectionReason = rejectionReason;
    // Lịch phỏng vấn đã đặt thì hủy cùng lúc từ chối
    if (application.interview?.scheduledAt) set['interview.confirmation'] = 'cancelled';
  }
  if (status === 'interview' && interview) set.interview = buildInterview(interview, null);

  const entry = {
    status,
    from: application.status,
    actorRole: 'employer',
    changedAt: now,
    changedBy: user.id,
    ...(status === 'rejected' && rejectionReason && { reason: rejectionReason }),
  };
  const updated = await Application.findOneAndUpdate(
    { _id: id, status: application.status },
    { $set: set, $push: { statusHistory: entry } },
    { new: true },
  );
  if (!updated) {
    throw new ApiError('INVALID_STATUS_TRANSITION', 'Trạng thái đơn vừa được thay đổi, vui lòng tải lại');
  }

  if (status === 'interview' && interview) {
    await notifyInterviewScheduled(updated, job, updated.interview, { rescheduled: false });
  } else {
    await notifyStatusChange(updated, job, status, rejectionReason);
  }
  return toDto(updated);
}

/** PATCH /applications/:id/review: sao 1-5 và ghi chú nội bộ (v1.20), chỉ nhà tuyển dụng thấy */
export async function review(user, id, { rating, note }) {
  await loadAuthorized(id, user);
  const set = { reviewedAt: new Date() };
  const unset = {};
  if (rating !== undefined) {
    if (rating === null) unset.rating = '';
    else set.rating = rating;
  }
  if (note !== undefined) {
    if (note === '') unset.employerNote = '';
    else set.employerNote = note;
  }
  const updated = await Application.findByIdAndUpdate(
    id,
    { $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
    { new: true },
  ).select('-cvSnapshot');
  return toDto(updated);
}

export async function getCvFile(user, id) {
  const { application } = await loadAuthorized(id, user);
  const snapshot = application.cvSnapshot;
  const file = snapshot?.storedPath && resolveStoredPath(snapshot.storedPath);
  if (!file) throw new ApiError('NOT_FOUND', 'Không tìm thấy file CV của đơn này');
  return { file, downloadName: snapshot.originalName || path.basename(file) };
}
