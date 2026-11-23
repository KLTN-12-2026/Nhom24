import { AUTO_PUBLISH } from '../../config/constants.js';
import { Company, Job, ModerationEvent, User } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { toPrivateCompanyDto } from '../companies/dto.js';
import { getSettingsView, recordEvent, updateSettings as saveSettings } from '../jobs/moderation.js';
import { createNotification } from '../notifications/service.js';
import { toOwner } from './moderation.js';

// Thao tác kiểm duyệt của admin: gỡ tin, cờ "luôn duyệt tay", thu hồi xác minh, cài đặt tự đăng.

const OWNER_FIELDS = 'fullName email phone status role';

export const getSettings = getSettingsView;
export const updateSettings = saveSettings;

export async function listJobEvents(jobId) {
  const job = await Job.findById(jobId).select('_id');
  if (!job) throw new ApiError('NOT_FOUND', 'Không tìm thấy tin tuyển dụng');
  const events = await ModerationEvent.find({ jobId }).sort({ createdAt: -1 }).limit(AUTO_PUBLISH.EVENTS_PAGE).lean();
  const actors = await User.find({ _id: { $in: events.map((e) => e.actorId).filter(Boolean) } }).select('fullName').lean();
  const actorById = new Map(actors.map((a) => [String(a._id), { id: String(a._id), fullName: a.fullName }]));
  return events.map((e) => ({
    id: String(e._id),
    action: e.action,
    actorRole: e.actorRole,
    actor: e.actorId ? (actorById.get(String(e.actorId)) ?? null) : null,
    from: e.from ?? null,
    to: e.to ?? null,
    reason: e.reason ?? null,
    flags: e.flags ?? [],
    fields: e.fields ?? [],
    note: e.note ?? null,
    createdAt: e.createdAt,
  }));
}

/** Gỡ tin đang đăng hoặc đang chờ: về `rejected` kèm ghi chú, tính là vi phạm; tùy chọn đặt luôn cờ "luôn duyệt tay" */
export async function takedownJob(admin, id, { note, flagCompany }) {
  const job = await Job.findById(id);
  if (!job) throw new ApiError('NOT_FOUND', 'Không tìm thấy tin tuyển dụng');
  if (!['published', 'pending'].includes(job.status)) {
    throw new ApiError('INVALID_STATUS_TRANSITION', `Chỉ gỡ được tin đang đăng hoặc chờ duyệt, tin này đang "${job.status}"`);
  }
  const updated = await Job.findOneAndUpdate(
    { _id: id, status: job.status },
    { $set: { status: 'rejected', reviewNote: note }, $unset: { pendingReason: '' } },
    { new: true },
  );
  if (!updated) throw new ApiError('INVALID_STATUS_TRANSITION', 'Tin vừa được xử lý bởi người khác, vui lòng tải lại');

  await recordEvent({
    jobId: updated._id,
    companyId: updated.companyId,
    actorId: admin.id,
    actorRole: 'admin',
    action: 'removed',
    from: job.status,
    to: 'rejected',
    flags: job.autoFlags,
    note,
  });
  if (flagCompany) await Company.updateOne({ _id: updated.companyId }, flagFields(admin, true, note));
  if (flagCompany) {
    await recordEvent({ jobId: updated._id, companyId: updated.companyId, actorId: admin.id, actorRole: 'admin', action: 'company_flagged', note });
  }
  await createNotification({
    userId: updated.employerId,
    type: 'job_rejected',
    title: 'Tin tuyển dụng đã bị gỡ',
    message: `Tin "${updated.title}" đã bị quản trị viên gỡ. Ghi chú: ${note}`,
    link: `/employer/jobs/${updated.id}/edit`,
    meta: { jobId: updated.id },
  });
  return { id: updated.id, status: updated.status, flaggedCompany: Boolean(flagCompany) };
}

const flagFields = (admin, on, note) => ({
  $set: { alwaysManualReview: on, manualReviewNote: on ? (note ?? null) : null, manualReviewAt: new Date(), manualReviewBy: admin.id },
});

async function companyView(company) {
  const owner = await User.findById(company.ownerId).select(OWNER_FIELDS);
  return {
    ...toPrivateCompanyDto(company),
    alwaysManualReview: Boolean(company.alwaysManualReview),
    manualReviewNote: company.manualReviewNote ?? null,
    owner: toOwner(owner),
  };
}

/** Đặt / bỏ cờ "luôn duyệt tay": chỉ admin thấy, không thông báo cho công ty */
export async function setCompanyTrust(admin, id, { alwaysManualReview, note }) {
  const company = await Company.findByIdAndUpdate(id, flagFields(admin, alwaysManualReview, note), { new: true });
  if (!company) throw new ApiError('NOT_FOUND', 'Không tìm thấy công ty');
  await recordEvent({
    companyId: company._id,
    actorId: admin.id,
    actorRole: 'admin',
    action: alwaysManualReview ? 'company_flagged' : 'company_unflagged',
    note: note || undefined,
  });
  return companyView(company);
}

/** Thu hồi trạng thái đã xác minh: `verified → rejected` kèm lý do, báo chủ công ty. Tin đang đăng giữ nguyên. */
export async function revokeVerification(admin, id, { reason }) {
  const company = await Company.findOneAndUpdate(
    { _id: id, verificationStatus: 'verified' },
    {
      $set: {
        verificationStatus: 'rejected',
        verificationNote: reason,
        verificationReviewedAt: new Date(),
        verificationReviewedBy: admin.id,
      },
    },
    { new: true },
  );
  if (!company) {
    if (!(await Company.exists({ _id: id }))) throw new ApiError('NOT_FOUND', 'Không tìm thấy công ty');
    throw new ApiError('INVALID_STATUS_TRANSITION', 'Chỉ thu hồi được công ty đang ở trạng thái đã xác minh');
  }
  await recordEvent({ companyId: company._id, actorId: admin.id, actorRole: 'admin', action: 'verification_revoked', note: reason });
  await createNotification({
    userId: company.ownerId,
    type: 'system',
    title: 'Trạng thái xác minh công ty đã bị thu hồi',
    message: `Công ty "${company.name}" không còn được xác minh. Lý do: ${reason}. Bạn có thể bổ sung hồ sơ và gửi lại.`,
    link: '/employer/company/verification',
    meta: { companyId: company.id },
  });
  return companyView(company);
}
