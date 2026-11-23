import { env } from '../../config/env.js';

const clientUrl = (path) => `${env.CLIENT_URL.replace(/\/$/, '')}${path}`;

/** Giờ hiển thị theo múi giờ Việt Nam, vì email là văn bản thuần không có cách khác để người đọc biết múi giờ */
export const formatVnDateTime = (date) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));

export const MODE_TEXT = { onsite: 'Phỏng vấn trực tiếp', online: 'Phỏng vấn online' };

/** Thư mời phỏng vấn hoặc báo đổi lịch gửi ứng viên */
export function interviewEmail({ candidateName, jobTitle, companyName, interview, applicationId, rescheduled }) {
  const subject = rescheduled
    ? `Lịch phỏng vấn đã thay đổi: ${jobTitle} - ${companyName}`
    : `Lời mời phỏng vấn: ${jobTitle} - ${companyName}`;
  const text = [
    `Chào ${candidateName},`,
    '',
    rescheduled
      ? `${companyName} đã thay đổi lịch phỏng vấn vị trí "${jobTitle}" của bạn.`
      : `${companyName} mời bạn phỏng vấn vị trí "${jobTitle}".`,
    '',
    `Thời gian: ${formatVnDateTime(interview.scheduledAt)} (giờ Việt Nam), dự kiến ${interview.durationMinutes} phút`,
    `Hình thức: ${MODE_TEXT[interview.mode]}`,
    `${interview.mode === 'online' ? 'Đường dẫn' : 'Địa điểm'}: ${interview.location}`,
    ...(interview.message ? ['', 'Lời nhắn từ nhà tuyển dụng:', interview.message] : []),
    '',
    `Vui lòng xác nhận tham dự hoặc đề nghị đổi giờ tại: ${clientUrl(`/candidate/applications?app=${applicationId}`)}`,
    '',
    '--',
    'Thư tự động từ nền tảng tuyển dụng. Bạn có thể trả lời nhà tuyển dụng ngay trong hồ sơ ứng tuyển.',
  ].join('\n');
  return { subject, text };
}
