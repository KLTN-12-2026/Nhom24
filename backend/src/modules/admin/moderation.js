import fs from 'node:fs/promises';
import { Company, Job, JobReport, RefreshToken, User } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { isFreeEmail } from '../../utils/email.js';
import { escapeRegex, skipOf } from '../../utils/queryHelpers.js';
import { buildMeta } from '../../utils/response.js';
import { foldText } from '../../utils/text.js';
import { toPrivateCompanyDto } from '../companies/dto.js';
import { licenseFileOf } from '../companies/verification.js';
import { withCompanies } from '../jobs/service.js';
import { createNotification } from '../notifications/service.js';
import { recordEvent } from '../jobs/moderation.js';

const OWNER_FIELDS = 'fullName email phone status role';

/**
 * Chủ công ty / chủ tin cho admin: kèm cờ cảnh báo email miền miễn phí. Đây luôn là nhà tuyển dụng,
 * không bao giờ là dữ liệu ứng viên.
 */
export const toOwner = (u) =>
  u
    ? { id: u.id, fullName: u.fullName, email: u.email, phone: u.phone ?? null, status: u.status, freeEmail: isFreeEmail(u.email) }
    : null;

// ---------- Duyệt công ty ----------

export async function listCompanies({ status, q, page, limit }) {
  const filter = {};
  if (status === 'unverified') filter.verificationStatus = { $in: ['unverified', null] };
  else if (status !== 'all') filter.verificationStatus = status;
  if (q) filter.nameSearch = new RegExp(escapeRegex(foldText(q)));

  const [companies, total] = await Promise.all([
    Company.find(filter)
      .select('+nameSearch')
      .sort({ verificationSubmittedAt: 1, createdAt: -1 })
      .skip(skipOf({ page, limit }))
      .limit(limit),
    Company.countDocuments(filter),
  ]);
  const owners = await User.find({ _id: { $in: companies.map((c) => c.ownerId) } }).select(OWNER_FIELDS);
  const ownerById = new Map(owners.map((o) => [o.id, toOwner(o)]));
  const items = companies.map((company) => ({
    ...toPrivateCompanyDto(company),
    alwaysManualReview: Boolean(company.alwaysManualReview), // v1.27: chỉ admin thấy
    manualReviewNote: company.manualReviewNote ?? null,
    owner: ownerById.get(String(company.ownerId)) ?? null,
  }));
  return { items, meta: buildMeta({ page, limit, total }) };
}

export async function reviewCompany(admin, id, { decision, reason }) {
  const company = await Company.findById(id);
  if (!company) throw new ApiError('NOT_FOUND', 'Không tìm thấy công ty');
  if (company.verificationStatus !== 'pending') {
    throw new ApiError('INVALID_STATUS_TRANSITION', 'Chỉ duyệt được hồ sơ đang chờ xác minh');
  }
  const approved = decision === 'approve';
  if (!approved && !reason) {
    throw new ApiError('VALIDATION_ERROR', 'Vui lòng nhập lý do từ chối', [
      { field: 'reason', message: 'Lý do từ chối là bắt buộc' },
    ]);
  }
  const updated = await Company.findOneAndUpdate(
    { _id: id, verificationStatus: 'pending' },
    {
      $set: {
        verificationStatus: approved ? 'verified' : 'rejected',
        verificationReviewedAt: new Date(),
        verificationReviewedBy: admin.id,
        ...(!approved && { verificationNote: reason }),
      },
      ...(approved && { $unset: { verificationNote: '' } }),
    },
    { new: true },
  );
  if (!updated) throw new ApiError('INVALID_STATUS_TRANSITION', 'Hồ sơ vừa được xử lý bởi người khác, vui lòng tải lại');

  await createNotification({
    userId: updated.ownerId,
    type: 'system',
    title: approved ? 'Công ty đã được xác minh' : 'Hồ sơ xác minh công ty chưa được duyệt',
    message: approved
      ? `Công ty "${updated.name}" đã được xác minh. Nhãn "Đã xác minh" hiển thị trên trang công ty và các tin tuyển dụng.`
      : `Hồ sơ xác minh của "${updated.name}" chưa được duyệt. Lý do: ${reason}. Bạn có thể bổ sung và gửi lại.`,
    link: '/employer/company/verification',
    meta: { companyId: updated.id },
  });
  const owner = await User.findById(updated.ownerId).select(OWNER_FIELDS);
  return { ...toPrivateCompanyDto(updated), owner: toOwner(owner) };
}

export async function getLicense(id) {
  const company = await Company.findById(id).select('businessLicense');
  const file = licenseFileOf(company?.businessLicense?.storedPath);
  if (!file) throw new ApiError('NOT_FOUND', 'Công ty chưa có giấy phép kinh doanh');
  if (!(await fs.stat(file).catch(() => null))) throw new ApiError('NOT_FOUND', 'Không tìm thấy file giấy phép');
  return { file, downloadName: company.businessLicense.originalName || 'giay-phep' };
}

// ---------- Báo cáo tin ----------

export async function listReports({ status, page, limit }) {
  const filter = status === 'all' ? {} : { status };
  const [reports, total] = await Promise.all([
    JobReport.find(filter)
      .sort({ createdAt: status === 'open' ? 1 : -1 })
      .skip(skipOf({ page, limit }))
      .limit(limit),
    JobReport.countDocuments(filter),
  ]);
  const jobs = await Job.find({ _id: { $in: reports.map((r) => r.jobId) } });
  const [jobItems, reporters, owners, openCounts] = await Promise.all([
    withCompanies(jobs),
    User.find({ _id: { $in: reports.map((r) => r.reporterId) } }).select('fullName email role'),
    User.find({ _id: { $in: jobs.map((j) => j.employerId) } }).select(OWNER_FIELDS),
    JobReport.aggregate([
      { $match: { jobId: { $in: jobs.map((j) => j._id) }, status: 'open' } },
      { $group: { _id: '$jobId', count: { $sum: 1 } } },
    ]),
  ]);
  const jobById = new Map(jobItems.map((j) => [String(j.id), j]));
  // Người báo cáo có thể là ứng viên: chỉ trả tên, email, vai trò; không trả số điện thoại
  const reporterById = new Map(
    reporters.map((u) => [u.id, { id: u.id, fullName: u.fullName, email: u.email, role: u.role }]),
  );
  const ownerById = new Map(owners.map((u) => [u.id, toOwner(u)]));
  const countByJob = new Map(openCounts.map((c) => [String(c._id), c.count]));

  const items = reports.map((report) => {
    const job = jobById.get(String(report.jobId));
    return {
      id: report.id,
      reason: report.reason,
      detail: report.detail ?? null,
      status: report.status,
      resolution: report.resolution ?? null,
      adminNote: report.adminNote ?? null,
      resolvedAt: report.resolvedAt ?? null,
      createdAt: report.createdAt,
      reporter: reporterById.get(String(report.reporterId)) ?? null,
      job: job && {
        id: job.id,
        title: job.title,
        status: job.status,
        city: job.city,
        company: job.company,
        openReportCount: countByJob.get(String(job.id)) ?? 0,
      },
      employer: job ? (ownerById.get(String(job.employerId)) ?? null) : null,
    };
  });
  return { items, meta: buildMeta({ page, limit, total }) };
}

export async function resolveReport(admin, id, { action, note, lockAccount }) {
  const report = await JobReport.findById(id);
  if (!report) throw new ApiError('NOT_FOUND', 'Không tìm thấy báo cáo');
  if (report.status !== 'open') throw new ApiError('INVALID_STATUS_TRANSITION', 'Báo cáo này đã được xử lý');

  if (action === 'dismiss') {
    const dismissed = await JobReport.findOneAndUpdate(
      { _id: id, status: 'open' },
      {
        status: 'dismissed',
        resolution: 'dismiss',
        adminNote: note || undefined,
        resolvedBy: admin.id,
        resolvedAt: new Date(),
      },
      { new: true },
    );
    if (!dismissed) throw new ApiError('INVALID_STATUS_TRANSITION', 'Báo cáo vừa được xử lý bởi người khác');
    return { id: dismissed.id, status: dismissed.status, resolution: dismissed.resolution, lockedAccount: false };
  }

  // action === 'remove': gỡ tin (về rejected, kèm ghi chú) và tùy chọn khóa tài khoản chủ tin
  if (!note) {
    throw new ApiError('VALIDATION_ERROR', 'Vui lòng nhập ghi chú khi gỡ tin', [
      { field: 'note', message: 'Ghi chú là bắt buộc khi gỡ tin' },
    ]);
  }
  const job = await Job.findById(report.jobId);
  const resolvedAt = new Date();
  // Mọi báo cáo còn mở của cùng một tin được xử lý chung
  await JobReport.updateMany(
    { jobId: report.jobId, status: 'open' },
    { status: 'resolved', resolution: 'remove', adminNote: note, resolvedBy: admin.id, resolvedAt },
  );
  let lockedAccount = false;
  if (job) {
    await Job.updateOne({ _id: job._id }, { $set: { status: 'rejected', reviewNote: note }, $unset: { pendingReason: '' } });
    await recordEvent({
      jobId: job._id,
      companyId: job.companyId,
      actorId: admin.id,
      actorRole: 'admin',
      action: 'removed',
      from: job.status,
      to: 'rejected',
      flags: job.autoFlags,
      note,
    });
    if (lockAccount) {
      const owner = await User.findOneAndUpdate(
        { _id: job.employerId, role: 'employer' },
        { status: 'locked' },
        { new: true },
      );
      if (owner) {
        lockedAccount = true;
        await RefreshToken.updateMany({ userId: owner._id, revokedAt: { $exists: false } }, { revokedAt: resolvedAt });
      }
    }
    await createNotification({
      userId: job.employerId,
      type: 'job_rejected',
      title: 'Tin tuyển dụng bị gỡ do báo cáo vi phạm',
      message: `Tin "${job.title}" đã bị gỡ sau khi quản trị viên xem xét báo cáo. Ghi chú: ${note}${lockedAccount ? '. Tài khoản của bạn đã bị khóa.' : ''}`,
      link: `/employer/jobs/${job.id}/edit`,
      meta: { jobId: job.id },
    });
  }
  return { id: report.id, status: 'resolved', resolution: 'remove', lockedAccount };
}
