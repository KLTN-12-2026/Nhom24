import { HIRING, LIMITS } from '../../config/constants.js';
import { Application, ApplicationMessage, Company, Job, JobReport, Notification, User } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { toDto } from '../../utils/serialize.js';
import { createNotification } from '../notifications/service.js';
import { loadAuthorized } from './access.js';

// Luồng đóng khi đơn đã bị từ chối hoặc ứng viên đã rút (mục 8.12)
const CLOSED_STATUSES = ['withdrawn', 'rejected'];
export const canSend = (application) => !CLOSED_STATUSES.includes(application.status);

const otherRole = (role) => (role === 'candidate' ? 'employer' : 'candidate');

// ---------- Chặn liên hệ ngoài nền tảng trong tin đầu của ứng viên ----------

// Đường dẫn, tên miền phổ biến, email. Không có `.net`/`.js` để khỏi bắt nhầm "ASP.NET", "Node.js".
const LINK_RE =
  /(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+\.[a-z]{2,}|\b[a-z0-9-]{2,}\.(?:com|vn|org|io|me|ly|co|info|biz|app|xyz|link|site|online|shop|top|cc|tk|ru)\b/i;
// Số điện thoại Việt Nam (0…, 84…, +84…, 9-11 chữ số, có thể có dấu cách, chấm, gạch) hoặc số quốc tế bắt đầu bằng +.
// Số không bắt đầu bằng 0/84 (ví dụ mức lương 15.000.000) không bị coi là điện thoại.
const PHONE_RE = /(?<![\d.,])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)|\+\d(?:[\s.-]?\d){8,}/;

export const containsExternalContact = (text) => LINK_RE.test(text) || PHONE_RE.test(text);

// ---------- DTO ----------

const toMessageDto = (message, viewerRole) => {
  const dto = toDto(message);
  delete dto.senderId;
  if (viewerRole) dto.mine = dto.senderRole === viewerRole;
  return dto;
};

/** Thống kê tin nhắn theo đơn cho danh sách: Map(applicationId -> { total, unread, lastAt }) từ góc nhìn `viewerRole` */
export async function messageStats(applicationIds, viewerRole) {
  const stats = new Map(applicationIds.map((id) => [String(id), { total: 0, unread: 0, lastAt: null }]));
  if (!applicationIds.length) return stats;
  const rows = await ApplicationMessage.aggregate([
    { $match: { applicationId: { $in: applicationIds } } },
    {
      $group: {
        _id: '$applicationId',
        total: { $sum: 1 },
        unread: { $sum: { $cond: [{ $and: [{ $ne: ['$senderRole', viewerRole] }, { $eq: [{ $ifNull: ['$readAt', null] }, null] }] }, 1, 0] } },
        lastAt: { $max: '$createdAt' },
      },
    },
  ]);
  for (const { _id, ...rest } of rows) stats.set(String(_id), rest);
  return stats;
}

// ---------- Đọc / gửi ----------

/** GET /applications/:id/messages */
export async function listMessages(user, id, { limit = HIRING.MESSAGES_PAGE, before } = {}) {
  const { application } = await loadAuthorized(id, user);
  const filter = { applicationId: application._id };
  if (before) filter._id = { $lt: before };

  const rows = await ApplicationMessage.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  const [total, unreadCount] = await Promise.all([
    ApplicationMessage.countDocuments({ applicationId: application._id }),
    ApplicationMessage.countDocuments({ applicationId: application._id, senderRole: otherRole(user.role), readAt: null }),
  ]);
  return {
    items: page.map((m) => toMessageDto(m, user.role)),
    meta: { limit, total, hasMore, unreadCount, canSend: canSend(application) },
  };
}

/** PATCH /applications/:id/messages/read: đánh dấu đã đọc mọi tin bên kia gửi (và thông báo tương ứng) */
export async function markRead(user, id) {
  const { application } = await loadAuthorized(id, user);
  const { modifiedCount } = await ApplicationMessage.updateMany(
    { applicationId: application._id, senderRole: otherRole(user.role), readAt: null },
    { readAt: new Date() },
  );
  await Notification.updateMany(
    { userId: user.id, type: 'application_message', 'meta.applicationId': application.id, isRead: false },
    { isRead: true },
  );
  return { updatedCount: modifiedCount };
}

async function assertMayPost(user, application, body) {
  if (!canSend(application)) {
    throw new ApiError('CONFLICT', 'Cuộc trao đổi này đã đóng vì đơn đã bị từ chối hoặc đã được rút');
  }

  const windowStart = new Date(Date.now() - LIMITS.MESSAGE_WINDOW_MINUTES * 60 * 1000);
  const recent = await ApplicationMessage.countDocuments({
    applicationId: application._id,
    senderId: user.id,
    createdAt: { $gte: windowStart },
  });
  if (recent >= LIMITS.MESSAGES_PER_WINDOW) {
    throw new ApiError('RATE_LIMITED', `Bạn gửi tối đa ${LIMITS.MESSAGES_PER_WINDOW} tin trong ${LIMITS.MESSAGE_WINDOW_MINUTES} phút, vui lòng đợi một chút`);
  }

  if (user.role !== 'candidate') return;
  // Nhà tuyển dụng chưa trả lời: giới hạn số tin và chặn liên hệ ngoài nền tảng (chống spam, lừa đảo)
  const replied = await ApplicationMessage.exists({ applicationId: application._id, senderRole: 'employer' });
  if (replied) return;
  if (containsExternalContact(body)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Tin nhắn đầu tiên không được chứa đường dẫn, email hoặc số điện thoại. Bạn có thể chia sẻ sau khi nhà tuyển dụng trả lời.',
      [{ field: 'body', message: 'Không gửi đường dẫn, email hoặc số điện thoại khi nhà tuyển dụng chưa trả lời' }],
    );
  }
  const sent = await ApplicationMessage.countDocuments({ applicationId: application._id, senderRole: 'candidate' });
  if (sent >= LIMITS.CANDIDATE_MESSAGES_BEFORE_REPLY) {
    throw new ApiError('RATE_LIMITED', 'Nhà tuyển dụng chưa trả lời. Bạn hãy đợi họ phản hồi trước khi nhắn thêm.');
  }
}

/** Thông báo cho bên nhận; còn thông báo chưa đọc của cùng đơn thì gộp lại thay vì tạo thêm */
async function notifyRecipient(user, application, job) {
  const toEmployer = user.role === 'candidate';
  const userId = toEmployer ? job.employerId : application.candidateId;
  const previous = await Notification.findOne({
    userId,
    type: 'application_message',
    isRead: false,
    'meta.applicationId': application.id,
  });
  const count = (previous?.meta?.count ?? 0) + 1;
  if (previous) await Notification.deleteOne({ _id: previous._id });

  let sender = user.fullName;
  if (!toEmployer) {
    const company = await Company.findById(job.companyId).select('name');
    sender = company?.name ?? 'Nhà tuyển dụng';
  }
  await createNotification({
    userId,
    type: 'application_message',
    title: `Tin nhắn mới từ ${sender}`,
    message: `Bạn có ${count > 1 ? `${count} tin nhắn mới` : 'tin nhắn mới'} về vị trí "${job.title}".`,
    link: toEmployer ? `/employer/applications/${application.id}` : `/candidate/applications?app=${application.id}&tab=messages`,
    meta: { applicationId: application.id, jobId: String(job._id), count },
  });
}

/** POST /applications/:id/messages */
export async function sendMessage(user, id, { body }) {
  const { application, job } = await loadAuthorized(id, user);
  await assertMayPost(user, application, body);
  const message = await ApplicationMessage.create({
    applicationId: application._id,
    senderId: user.id,
    senderRole: user.role,
    body,
  });
  await notifyRecipient(user, application, job);
  return toMessageDto(message, user.role);
}

// ---------- Admin ----------

/**
 * GET /admin/applications/:id/messages: chỉ đọc, và chỉ khi tin của đơn đang có báo cáo chờ xử lý (mục 8.12).
 * Không trả email hay số điện thoại.
 */
export async function adminThread(id) {
  const application = await Application.findById(id).select('-cvSnapshot');
  if (!application) throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn ứng tuyển');
  const job = await Job.findById(application.jobId).select('title companyId');
  if (!job || !(await JobReport.exists({ jobId: job._id, status: 'open' }))) {
    throw new ApiError('FORBIDDEN', 'Chỉ xem được tin nhắn khi tin tuyển dụng của đơn này có báo cáo đang chờ xử lý');
  }
  const [candidate, company, messages] = await Promise.all([
    User.findById(application.candidateId).select('fullName'),
    Company.findById(job.companyId).select('name'),
    ApplicationMessage.find({ applicationId: application._id }).sort({ _id: 1 }).limit(500),
  ]);
  return {
    application: {
      id: application.id,
      jobId: job.id,
      jobTitle: job.title,
      status: application.status,
      candidateName: candidate?.fullName ?? '',
      companyName: company?.name ?? '',
    },
    messages: messages.map((m) => toMessageDto(m)),
  };
}
