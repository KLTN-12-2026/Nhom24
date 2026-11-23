import { HIRING } from '../../config/constants.js';
import { Application, Company, Job, User } from '../../models/index.js';
import { sendMail } from '../../providers/mail/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { toDto } from '../../utils/serialize.js';
import { createNotification } from '../notifications/service.js';
import { forCandidate, loadAuthorized } from './access.js';
import { formatVnDateTime, interviewEmail } from './emailTemplates.js';

/** Dựng lịch phỏng vấn mới từ dữ liệu đã validate; đổi lịch thì ghi đè và đưa xác nhận về `pending` */
export function buildInterview(input, previous) {
  return {
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes ?? HIRING.INTERVIEW_DEFAULT_MINUTES,
    mode: input.mode,
    location: input.location,
    ...(input.message && { message: input.message }),
    confirmation: 'pending',
    rescheduleCount: previous ? (previous.rescheduleCount ?? 0) + 1 : 0,
    updatedAt: new Date(),
  };
}

/**
 * Báo ứng viên về lịch phỏng vấn (thông báo trong ứng dụng + email). Thư giao dịch nên không bị tắt bởi
 * notificationSettings. Lỗi gửi thư đã được sendMail nuốt, không làm hỏng thao tác chính.
 */
export async function notifyInterviewScheduled(application, job, interview, { rescheduled }) {
  const [company, candidate] = await Promise.all([
    Company.findById(job.companyId).select('name'),
    User.findById(application.candidateId).select('email fullName'),
  ]);
  const companyName = company?.name ?? 'Nhà tuyển dụng';
  await createNotification({
    userId: application.candidateId,
    type: 'interview',
    title: rescheduled ? 'Lịch phỏng vấn đã thay đổi' : 'Bạn được mời phỏng vấn',
    message: `${companyName} ${rescheduled ? 'đổi lịch' : 'mời bạn'} phỏng vấn vị trí "${job.title}" vào ${formatVnDateTime(interview.scheduledAt)}. Hãy xác nhận hoặc đề nghị đổi giờ.`,
    link: `/candidate/applications?app=${application.id}`,
    meta: { applicationId: application.id, jobId: String(job._id), scheduledAt: interview.scheduledAt },
  });
  if (candidate?.email) {
    const mail = interviewEmail({
      candidateName: candidate.fullName,
      jobTitle: job.title,
      companyName,
      interview,
      applicationId: application.id,
      rescheduled,
    });
    await sendMail({ to: candidate.email, ...mail });
  }
}

/** PUT /applications/:id/interview: đặt hoặc đổi lịch khi đơn đang ở `interview` */
export async function setInterview(user, id, input) {
  const { application, job } = await loadAuthorized(id, user);
  if (application.status !== 'interview') {
    throw new ApiError('INVALID_STATUS_TRANSITION', 'Chỉ đặt được lịch phỏng vấn khi đơn đang ở bước "Hẹn phỏng vấn"');
  }
  const previous = application.interview?.scheduledAt ? application.interview : null;
  const updated = await Application.findOneAndUpdate(
    { _id: id, status: 'interview' },
    { $set: { interview: buildInterview(input, previous) } },
    { new: true },
  ).select('-cvSnapshot');
  if (!updated) {
    throw new ApiError('INVALID_STATUS_TRANSITION', 'Trạng thái đơn vừa được thay đổi, vui lòng tải lại');
  }
  await notifyInterviewScheduled(updated, job, updated.interview, { rescheduled: Boolean(previous) });
  return toDto(updated);
}

/** PATCH /applications/:id/interview/respond: ứng viên xác nhận hoặc đề nghị đổi giờ */
export async function respond(user, id, { response, proposedAt, note }) {
  const { application, job } = await loadAuthorized(id, user);
  const current = application.interview;
  if (application.status !== 'interview' || !current?.scheduledAt || current.confirmation === 'cancelled') {
    throw new ApiError('INVALID_STATUS_TRANSITION', 'Đơn này chưa có lịch phỏng vấn để phản hồi');
  }
  if (current.scheduledAt.getTime() < Date.now()) {
    throw new ApiError('CONFLICT', 'Lịch phỏng vấn này đã qua, hãy nhắn tin cho nhà tuyển dụng để sắp xếp lại');
  }

  const confirmed = response === 'confirm';
  const set = {
    'interview.confirmation': confirmed ? 'confirmed' : 'reschedule_requested',
    'interview.respondedAt': new Date(),
  };
  // Phản hồi mới ghi đè hoàn toàn phản hồi trước
  const unset = { 'interview.proposedAt': '', 'interview.responseNote': '' };
  if (!confirmed) {
    set['interview.proposedAt'] = proposedAt;
    delete unset['interview.proposedAt'];
    if (note) {
      set['interview.responseNote'] = note;
      delete unset['interview.responseNote'];
    }
  }

  const updated = await Application.findOneAndUpdate(
    { _id: id, status: 'interview', 'interview.scheduledAt': current.scheduledAt },
    { $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
    { new: true },
  ).select('-cvSnapshot');
  if (!updated) throw new ApiError('INVALID_STATUS_TRANSITION', 'Lịch phỏng vấn vừa được thay đổi, vui lòng tải lại');

  await createNotification({
    userId: job.employerId,
    type: 'interview',
    title: confirmed ? 'Ứng viên đã xác nhận lịch phỏng vấn' : 'Ứng viên đề nghị đổi giờ phỏng vấn',
    message: confirmed
      ? `${user.fullName} xác nhận tham dự phỏng vấn vị trí "${job.title}" lúc ${formatVnDateTime(current.scheduledAt)}.`
      : `${user.fullName} đề nghị đổi giờ phỏng vấn vị trí "${job.title}" sang ${formatVnDateTime(proposedAt)}. Hãy đặt lại lịch trong hồ sơ.`,
    link: `/employer/applications/${id}`,
    meta: { applicationId: id, jobId: String(job._id), confirmation: updated.interview.confirmation },
  });
  return forCandidate(toDto(updated));
}

/** GET /interviews/upcoming: lịch phỏng vấn sắp tới của chính mình (ứng viên hoặc nhà tuyển dụng) */
export async function upcoming(user, { limit = HIRING.UPCOMING_DEFAULT } = {}) {
  const isEmployer = user.role === 'employer';
  const filter = {
    status: 'interview',
    'interview.scheduledAt': { $gte: new Date() },
    'interview.confirmation': { $ne: 'cancelled' },
  };
  if (isEmployer) {
    const jobs = await Job.find({ employerId: user.id }).select('_id');
    filter.jobId = { $in: jobs.map((j) => j._id) };
  } else {
    filter.candidateId = user.id;
  }

  const applications = await Application.find(filter).select('-cvSnapshot').sort({ 'interview.scheduledAt': 1 }).limit(limit);
  const jobs = await Job.find({ _id: { $in: applications.map((a) => a.jobId) } }).select('title companyId');
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const [companies, candidates] = await Promise.all([
    Company.find({ _id: { $in: jobs.map((j) => j.companyId) } }).select('name'),
    isEmployer ? User.find({ _id: { $in: applications.map((a) => a.candidateId) } }).select('fullName') : [],
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const candidateName = new Map(candidates.map((c) => [c.id, c.fullName]));

  return applications.map((a) => {
    const job = jobById.get(String(a.jobId));
    const i = a.interview;
    return {
      applicationId: a.id,
      jobId: String(a.jobId),
      jobTitle: job?.title ?? '',
      companyName: companyName.get(String(job?.companyId)) ?? '',
      ...(isEmployer && { candidateName: candidateName.get(String(a.candidateId)) ?? '' }),
      scheduledAt: i.scheduledAt,
      durationMinutes: i.durationMinutes,
      mode: i.mode,
      location: i.location,
      confirmation: i.confirmation,
      ...(i.proposedAt && { proposedAt: i.proposedAt }),
    };
  });
}
