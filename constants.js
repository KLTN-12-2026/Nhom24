// Enum dùng chung, đồng bộ với backend/src/config/constants.js
export const ROLES = ['candidate', 'employer', 'admin'];
export const USER_STATUS = ['active', 'locked'];
export const JOB_STATUS = ['draft', 'pending', 'published', 'closed', 'rejected'];
export const APPLICATION_STATUS = [
  'submitted', 'viewed', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn',
];
export const EMPLOYMENT_TYPE = ['full-time', 'part-time', 'internship', 'contract', 'freelance'];
export const WORK_MODE = ['onsite', 'remote', 'hybrid'];
export const LEVEL = ['intern', 'fresher', 'junior', 'middle', 'senior', 'lead', 'manager'];
export const EDUCATION = ['none', 'high_school', 'college', 'bachelor', 'master', 'phd']; // hạng 0..5
export const JOB_CATEGORY = [
  'it-software', 'it-data-ai', 'it-infra-security', 'design', 'marketing', 'sales',
  'finance-accounting', 'hr-admin', 'education', 'healthcare', 'engineering',
  'logistics', 'hospitality', 'other',
];
export const SKILL_TYPE = ['technical', 'soft', 'language', 'tool'];
export const SKILL_LEVEL = ['beginner', 'intermediate', 'advanced', 'unknown'];
export const NOTIFICATION_TYPE = [
  'application_status', 'new_application', 'job_approved', 'job_rejected', 'system', 'job_alert', 'company_new_job',
  'interview', 'application_message', // v1.20
];
// v1.20: không thuộc /meta/enums
export const INTERVIEW_MODE = ['onsite', 'online'];
export const INTERVIEW_CONFIRMATION = ['pending', 'confirmed', 'reschedule_requested', 'cancelled'];
export const SAVED_SEARCH_FREQUENCY = ['instant', 'daily', 'off']; // v1.19
export const MATCH_LABELS = ['excellent', 'good', 'fair', 'low'];

// Nhãn tiếng Việt
export const ROLE_LABEL = { candidate: 'Ứng viên', employer: 'Nhà tuyển dụng', admin: 'Quản trị viên' };
export const USER_STATUS_LABEL = { active: 'Hoạt động', locked: 'Đã khóa' };
export const JOB_STATUS_LABEL = {
  draft: 'Nháp', pending: 'Chờ duyệt', published: 'Đang tuyển', closed: 'Đã đóng', rejected: 'Bị từ chối',
};
// Nhãn cho ứng viên
export const APPLICATION_STATUS_LABEL = {
  submitted: 'Đã nộp', viewed: 'Đã xem', shortlisted: 'Vào danh sách ngắn',
  interview: 'Phỏng vấn', offered: 'Nhận đề nghị', hired: 'Trúng tuyển', rejected: 'Từ chối', withdrawn: 'Đã rút',
};
// Nhãn cho nhà tuyển dụng (v1.20): tên các cột của quy trình xử lý hồ sơ
export const EMPLOYER_STATUS_LABEL = {
  submitted: 'Mới', viewed: 'Đang xem', shortlisted: 'Danh sách ngắn',
  interview: 'Hẹn phỏng vấn', offered: 'Đề nghị', hired: 'Đã nhận', rejected: 'Từ chối', withdrawn: 'Ứng viên rút',
};
// Sáu cột của dạng xem kéo thả; `shortlisted` nằm chung cột "Đang xem"
export const PIPELINE_COLUMNS = [
  { key: 'submitted', label: 'Mới', statuses: ['submitted'] },
  { key: 'viewed', label: 'Đang xem', statuses: ['viewed', 'shortlisted'] },
  { key: 'interview', label: 'Hẹn phỏng vấn', statuses: ['interview'] },
  { key: 'offered', label: 'Đề nghị', statuses: ['offered'] },
  { key: 'hired', label: 'Đã nhận', statuses: ['hired'] },
  { key: 'rejected', label: 'Từ chối', statuses: ['rejected'] },
];
export const INTERVIEW_MODE_LABEL = { onsite: 'Trực tiếp', online: 'Online' };
export const INTERVIEW_CONFIRMATION_LABEL = {
  pending: 'Chờ ứng viên xác nhận', confirmed: 'Ứng viên đã xác nhận',
  reschedule_requested: 'Ứng viên đề nghị đổi giờ', cancelled: 'Đã hủy',
};
// Nhãn ngắn cho ứng viên nhìn lịch của chính mình
export const INTERVIEW_CONFIRMATION_LABEL_CANDIDATE = {
  pending: 'Chờ bạn xác nhận', confirmed: 'Bạn đã xác nhận',
  reschedule_requested: 'Bạn đã đề nghị đổi giờ', cancelled: 'Đã hủy',
};
export const EMPLOYMENT_TYPE_LABEL = {
  'full-time': 'Toàn thời gian', 'part-time': 'Bán thời gian', internship: 'Thực tập',
  contract: 'Hợp đồng', freelance: 'Freelance',
};
export const WORK_MODE_LABEL = { onsite: 'Tại văn phòng', remote: 'Từ xa', hybrid: 'Linh hoạt' };
export const LEVEL_LABEL = {
  intern: 'Thực tập sinh', fresher: 'Fresher', junior: 'Junior', middle: 'Middle', senior: 'Senior', lead: 'Lead', manager: 'Quản lý',
};
export const EDUCATION_LABEL = {
  none: 'Không yêu cầu', high_school: 'Trung học', college: 'Cao đẳng', bachelor: 'Đại học', master: 'Thạc sĩ', phd: 'Tiến sĩ',
};
export const JOB_CATEGORY_LABEL = {
  'it-software': 'CNTT - Phần mềm', 'it-data-ai': 'CNTT - Dữ liệu/AI', 'it-infra-security': 'CNTT - Hạ tầng/Bảo mật',
  design: 'Thiết kế', marketing: 'Marketing', sales: 'Kinh doanh', 'finance-accounting': 'Tài chính - Kế toán',
  'hr-admin': 'Nhân sự - Hành chính', education: 'Giáo dục', healthcare: 'Y tế', engineering: 'Kỹ thuật',
  logistics: 'Logistics', hospitality: 'Nhà hàng - Khách sạn', other: 'Khác',
};
// Nhãn tính ở API: tone dùng cho Chip
export const JOB_LABEL_TEXT = { new: 'Mới', urgent: 'Gấp', hot: 'Hot' };
export const JOB_LABEL_TONE = { new: 'accent', urgent: 'danger', hot: 'warn' };
export const POSTED_WITHIN_LABEL = { '24h': '24 giờ qua', '7d': '7 ngày qua', '30d': '30 ngày qua' };
export const MATCH_LABEL_TEXT = { excellent: 'Rất phù hợp', good: 'Phù hợp', fair: 'Tương đối', low: 'Ít phù hợp' };

export const STORAGE_KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  user: 'user',
  deviceId: 'deviceId', // v1.23
};

// Trang chủ theo vai trò (dùng sau đăng nhập và khi truy cập sai quyền)
// v1.15: thiếu VITE_GOOGLE_CLIENT_ID thì ẩn nút đăng nhập Google
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
export const GOOGLE_ENABLED = GOOGLE_CLIENT_ID !== '';

export const ROLE_HOME = {
  candidate: '/candidate/dashboard',
  employer: '/employer/dashboard',
  admin: '/admin/dashboard',
};

// quy mô công ty (không có trong /meta/enums)
export const COMPANY_SIZE = ['1-10', '11-50', '51-200', '201-500', '500+'];
export const NOTIFICATION_TYPE_LABEL = {
  application_status: 'Đơn ứng tuyển',
  new_application: 'Ứng viên mới',
  job_approved: 'Tin được duyệt',
  job_rejected: 'Tin bị từ chối',
  system: 'Hệ thống',
  job_alert: 'Việc làm mới',
  company_new_job: 'Công ty theo dõi',
  interview: 'Phỏng vấn',
  application_message: 'Tin nhắn',
};

// Chuyển trạng thái hợp lệ
// v1.20: chỉ đi tới, có thể nhảy tới phỏng vấn; offered chỉ sau phỏng vấn
export const EMPLOYER_APPLICATION_TRANSITIONS = {
  submitted: ['viewed', 'shortlisted', 'interview', 'rejected'],
  viewed: ['shortlisted', 'interview', 'rejected'],
  shortlisted: ['interview', 'rejected'],
  interview: ['offered', 'hired', 'rejected'],
  offered: ['hired', 'rejected'],
};
export const WITHDRAWABLE_STATUS = ['submitted', 'viewed', 'shortlisted', 'interview', 'offered'];
export const MESSAGE_MAX = 2000;

// v1.14: xác minh công ty và báo cáo tin
export const COMPANY_VERIFICATION_STATUS = ['unverified', 'pending', 'verified', 'rejected'];
export const COMPANY_VERIFICATION_LABEL = {
  unverified: 'Chưa xác minh',
  pending: 'Đang chờ duyệt',
  verified: 'Đã xác minh',
  rejected: 'Bị từ chối',
};
export const REPORT_REASON = ['scam', 'incorrect', 'duplicate', 'other'];
export const REPORT_REASON_LABEL = {
  scam: 'Lừa đảo, thu phí ứng viên',
  incorrect: 'Nội dung sai sự thật',
  duplicate: 'Tin trùng lặp',
  other: 'Lý do khác',
};
export const REPORT_STATUS_LABEL = { open: 'Chờ xử lý', dismissed: 'Đã bỏ qua', resolved: 'Đã gỡ tin' };

// v1.21: công cụ AI cho ứng viên (không thuộc /meta/enums)
export const AI_TONES = [
  { value: 'formal', label: 'Trang trọng' },
  { value: 'friendly', label: 'Thân thiện' },
  { value: 'concise', label: 'Ngắn gọn' },
];
export const AI_LENGTHS = [
  { value: 'short', label: 'Ngắn (khoảng 120 từ)' },
  { value: 'medium', label: 'Vừa (khoảng 200 từ)' },
  { value: 'long', label: 'Dài (khoảng 300 từ)' },
];
export const INTERVIEW_TYPE_LABEL = { technical: 'Kỹ thuật', behavioral: 'Hành vi', situational: 'Tình huống' };
// v1.23: budget (cầu dao ngân sách tổng đã đóng), disabled (quản trị viên tạm tắt AI)
export const AI_FAILURE_REASON_TEXT = {
  budget: 'hệ thống đã dùng hết ngân sách AI hôm nay',
  disabled: 'quản trị viên đang tạm tắt công cụ AI',
  quota: 'hết hạn mức AI',
  overloaded: 'dịch vụ AI đang quá tải',
  config: 'lỗi cấu hình AI',
  invalid_output: 'AI trả kết quả không dùng được',
};

// v1.23: phiên bản Điều khoản + Quyền riêng tư (đồng bộ backend PRIVACY.TERMS_VERSION)
export const TERMS_VERSION = '2026-10-26';
export const TERMS_VERSION_LABEL = '26/10/2026';

// v1.23: tên công cụ AI trong trang "Theo dõi AI"
export const AI_TOOL_LABEL = {
  cv_parse: 'Phân tích CV',
  match_explain: 'Giải thích điểm phù hợp',
  career_advice: 'Tư vấn nghề nghiệp',
  cv_review: 'Chấm CV theo tin',
  cover_letter: 'Thư xin việc',
  interview_set: 'Câu hỏi phỏng vấn',
  interview_answer: 'Nhận xét câu trả lời',
  embedding: 'Vector ngữ nghĩa (embedding)', // v1.24
  other: 'Khác',
};
export const AI_FAILURE_GROUP_LABEL = {
  quota: 'Hết hạn mức nhà cung cấp',
  overloaded: 'Quá tải / mạng',
  config: 'Lỗi cấu hình',
  invalid_output: 'Kết quả không dùng được',
};

// v1.25: ví điểm
export const WALLET_TX_LABEL = { topup: 'Nạp điểm', spend: 'Dùng điểm', refund: 'Hoàn điểm', bonus: 'Điểm thưởng', adjust: 'Điều chỉnh' };
export const WALLET_ORDER_STATUS_LABEL = { pending: 'Chờ thanh toán', success: 'Thành công', failed: 'Thất bại', expired: 'Hết hạn', cancelled: 'Đã hủy' };
// Chỉ 4 sắc: trung tính, teal, nâu vàng, đỏ
export const WALLET_ORDER_STATUS_TONE = { pending: 'warn', success: 'accent', failed: 'danger', expired: 'plain', cancelled: 'plain' };
export const WALLET_TOOL_LABEL = {
  cv_review: 'Chấm CV theo tin',
  cover_letter: 'Viết thư xin việc',
  interview_set: 'Tạo bộ câu hỏi phỏng vấn',
  interview_answer: 'Nhận xét câu trả lời luyện tập',
};
export const WALLET_SANDBOX_NOTICE = 'Môi trường thử nghiệm, không thu tiền thật';

// v1.27: kiểm duyệt tin và tự đăng cho công ty đã xác minh. Chỉ trang admin dùng các nhãn chi tiết.
export const PENDING_REASON = ['unverified_company', 'email_unverified', 'company_flagged', 'auto_publish_off', 'recent_violations', 'content_flags', 'reported'];
export const PENDING_REASON_LABEL = {
  unverified_company: 'Công ty chưa xác minh',
  email_unverified: 'Email chưa xác minh',
  company_flagged: 'Công ty bị đặt "luôn duyệt tay"',
  auto_publish_off: 'Tự đăng đang tắt',
  recent_violations: 'Vi phạm gần đây',
  content_flags: 'Có dấu hiệu tự động',
  reported: 'Bị nhiều người báo cáo',
};
export const AUTO_FLAG = ['phone', 'email', 'external_link', 'social', 'banned_keyword', 'scam_keyword', 'salary_anomaly', 'duplicate', 'title_caps', 'title_short'];
export const AUTO_FLAG_LABEL = {
  phone: 'Số điện thoại',
  email: 'Email',
  external_link: 'Liên kết ngoài',
  social: 'Mạng xã hội',
  banned_keyword: 'Từ khóa cấm',
  scam_keyword: 'Từ khóa lừa đảo',
  salary_anomaly: 'Lương bất thường',
  duplicate: 'Gần trùng tin khác',
  title_caps: 'Tiêu đề toàn chữ hoa',
  title_short: 'Tiêu đề quá ngắn',
};
export const PUBLISH_SOURCE_LABEL = { auto: 'Tự đăng', manual: 'Duyệt tay' };
export const MODERATION_ACTION_LABEL = {
  auto_published: 'Tự đăng',
  sent_to_review: 'Gửi chờ duyệt',
  approved: 'Admin duyệt',
  rejected: 'Admin từ chối',
  removed: 'Admin gỡ tin',
  edited: 'Sửa nội dung quan trọng',
  edit_to_review: 'Sửa nội dung, về chờ duyệt',
  reported_to_review: 'Bị báo cáo, về chờ duyệt',
  company_flagged: 'Đặt "luôn duyệt tay"',
  company_unflagged: 'Bỏ "luôn duyệt tay"',
  verification_revoked: 'Thu hồi xác minh',
  settings_changed: 'Đổi cài đặt tự đăng',
};
