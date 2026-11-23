import { JOB_STATUS, ROLES } from '../../config/constants.js';
import { Application, Company, Job, User } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { isFreeEmail } from '../../utils/email.js';
import { countBy, dailyCounts, escapeRegex, skipOf } from '../../utils/queryHelpers.js';
import { buildMeta } from '../../utils/response.js';
import { refreshJobEmbedding, withCompanies } from '../jobs/service.js';
import { triggerJobAlerts } from '../alerts/dispatcher.js';
import { createNotification } from '../notifications/service.js';
import { importantHash, recordEvent } from '../jobs/moderation.js';

const TOP_CATEGORIES = 5;

const toUserItem = (u) => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  phone: u.phone ?? null,
  role: u.role,
  status: u.status,
  lastLoginAt: u.lastLoginAt ?? null,
  createdAt: u.createdAt,
  deleted: Boolean(u.deletedAt), // v1.23
});

export async function listUsers({ role, status, q, page, limit }) {
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ email: re }, { fullName: re }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skipOf({ page, limit })).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items: users.map(toUserItem), meta: buildMeta({ page, limit, total }) };
}

export async function setUserStatus(admin, id, status) {
  if (id === admin.id) throw new ApiError('FORBIDDEN', 'Bạn không thể khóa chính tài khoản của mình');
  const existing = await User.findById(id).select('deletedAt');
  if (!existing) throw new ApiError('NOT_FOUND', 'Không tìm thấy người dùng');
  if (existing.deletedAt) throw new ApiError('CONFLICT', 'Tài khoản này đã được xóa, không thể mở khóa');
  const user = await User.findByIdAndUpdate(id, { status }, { new: true });
  return toUserItem(user);
}

export async function listJobs({ status, reason, flag, source, page, limit }) {
  const filter = { status };
  if (reason) filter.pendingReason = reason;
  if (flag) filter.autoFlags = flag;
  if (source) filter.publishSource = source;
  const [jobs, total] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip(skipOf({ page, limit })).limit(limit),
    Job.countDocuments(filter),
  ]);
  const [employers, companies] = await Promise.all([
    User.find({ _id: { $in: jobs.map((j) => j.employerId) } }),
    Company.find({ _id: { $in: jobs.map((j) => j.companyId) } }).select('alwaysManualReview'),
  ]);
  const manualByCompany = new Map(companies.map((c) => [c.id, Boolean(c.alwaysManualReview)]));
  const moderationById = new Map(
    jobs.map((j) => [
      j.id,
      {
        source: j.publishSource ?? null,
        pendingReason: j.pendingReason ?? null,
        flags: j.autoFlags ?? [],
        checkedAt: j.autoCheckedAt ?? null,
        companyAlwaysManual: manualByCompany.get(String(j.companyId)) ?? false,
      },
    ]),
  );
  const employerById = new Map(
    employers.map((e) => [e.id, { id: e.id, fullName: e.fullName, email: e.email, freeEmail: isFreeEmail(e.email) }]),
  );
  const items = (await withCompanies(jobs)).map((job) => ({
    ...job,
    employer: employerById.get(String(job.employerId)) ?? null,
    moderation: moderationById.get(String(job.id)),
  }));
  return { items, meta: buildMeta({ page, limit, total }) };
}

export async function reviewJob(admin, id, { decision, reviewNote }) {
  const job = await Job.findById(id);
  if (!job) throw new ApiError('NOT_FOUND', 'Không tìm thấy tin tuyển dụng');
  if (job.status !== 'pending') {
    throw new ApiError('INVALID_STATUS_TRANSITION', `Chỉ duyệt được tin đang chờ duyệt, tin này đang "${job.status}"`);
  }

  const approved = decision === 'approve';
  const update = approved
    ? {
        $set: {
          status: 'published',
          publishSource: 'manual', // v1.27
          lastReviewedAt: new Date(),
          reviewedHash: importantHash(job),
          ...(job.publishedAt ? {} : { publishedAt: new Date() }),
        },
        $unset: { reviewNote: '', pendingReason: '' },
      }
    : { $set: { status: 'rejected', reviewNote: reviewNote ?? '' }, $unset: { pendingReason: '' } };
  const updated = await Job.findOneAndUpdate({ _id: id, status: 'pending' }, update, { new: true });
  if (!updated) {
    throw new ApiError('INVALID_STATUS_TRANSITION', 'Tin vừa được xử lý bởi người khác, vui lòng tải lại');
  }

  await recordEvent({
    jobId: updated._id,
    companyId: updated.companyId,
    actorId: admin.id,
    actorRole: 'admin',
    action: approved ? 'approved' : 'rejected',
    from: 'pending',
    to: updated.status,
    reason: job.pendingReason,
    flags: job.autoFlags,
    note: reviewNote || undefined,
  });
  await createNotification({
    userId: updated.employerId,
    type: approved ? 'job_approved' : 'job_rejected',
    title: approved ? 'Tin tuyển dụng đã được duyệt' : 'Tin tuyển dụng bị từ chối',
    message: approved
      ? `Tin "${updated.title}" đã được duyệt và đang hiển thị với ứng viên.`
      : `Tin "${updated.title}" chưa được duyệt${reviewNote ? `. Lý do: ${reviewNote}` : ''}. Bạn có thể sửa lại và gửi duyệt lần nữa.`,
    link: approved ? '/employer/jobs' : `/employer/jobs/${updated.id}/edit`,
    meta: { jobId: updated.id },
  });
  if (approved && !updated.embeddingHash) await refreshJobEmbedding(id);
  if (approved) await triggerJobAlerts(id); // v1.19

  const [item] = await withCompanies([updated]);
  return item;
}

export async function stats() {
  const [usersByRole, jobsByStatus, totalApplications, newUsersLast30Days, categoryRows] = await Promise.all([
    countBy(User, 'role', ROLES),
    countBy(Job, 'status', JOB_STATUS),
    Application.countDocuments(),
    dailyCounts(User, {}, 30),
    Job.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: TOP_CATEGORIES },
    ]),
  ]);
  return {
    usersByRole,
    jobsByStatus,
    totalApplications,
    newUsersLast30Days,
    topCategories: categoryRows.map((r) => ({ category: r._id, count: r.count })),
  };
}
