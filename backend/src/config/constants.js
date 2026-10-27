export const ROLES = ['candidate', 'employer', 'admin'];
export const USER_STATUS = ['active', 'locked'];
export const JOB_STATUS = ['draft', 'pending', 'published', 'closed', 'rejected'];
export const APPLICATION_STATUS = [
  'submitted',
  'viewed',
  'shortlisted',
  'interview',
  'offered', // v1.20: Đề nghị
  'hired',
  'rejected',
  'withdrawn',
];
export const EMPLOYMENT_TYPE = ['full-time', 'part-time', 'internship', 'contract', 'freelance'];
export const WORK_MODE = ['onsite', 'remote', 'hybrid'];
export const LEVEL = ['intern', 'fresher', 'junior', 'middle', 'senior', 'lead', 'manager'];
// Thứ hạng 0..5 theo đúng thứ tự mảng này
export const EDUCATION = ['none', 'high_school', 'college', 'bachelor', 'master', 'phd'];
export const JOB_CATEGORY = [
  'it-software',
  'it-data-ai',
  'it-infra-security',
  'design',
  'marketing',
  'sales',
  'finance-accounting',
  'hr-admin',
  'education',
  'healthcare',
  'engineering',
  'logistics',
  'hospitality',
  'other',
];
// Tên ngành hiển thị (tiếng Việt) của JOB_CATEGORY, dùng ở GET /meta/industries (v1.11)
export const JOB_CATEGORY_LABEL = {
  'it-software': 'Phần mềm',
  'it-data-ai': 'Dữ liệu & AI',
  'it-infra-security': 'Hạ tầng & Bảo mật',
  design: 'Thiết kế',
  marketing: 'Marketing',
  sales: 'Kinh doanh',
  'finance-accounting': 'Kế toán - Tài chính',
  'hr-admin': 'Nhân sự - Hành chính',
  education: 'Giáo dục',
  healthcare: 'Y tế',
  engineering: 'Kỹ thuật - Sản xuất',
  logistics: 'Logistics',
  hospitality: 'Nhà hàng - Bán lẻ',
  other: 'Khác',
};
export const SKILL_TYPE = ['technical', 'soft', 'language', 'tool'];
export const SKILL_LEVEL = ['beginner', 'intermediate', 'advanced', 'unknown'];
export const NOTIFICATION_TYPE = [
  'application_status',
  'new_application',
  'job_approved',
  'job_rejected',
  'system',
  'job_alert', // v1.19: tin mới khớp tìm kiếm đã lưu
  'company_new_job', // v1.19: công ty đang theo dõi có tin mới
  'interview', // v1.20: lịch phỏng vấn (đặt, đổi, ứng viên phản hồi)
  'application_message', // v1.20: tin nhắn trong hồ sơ ứng tuyển
];
export const SAVED_SEARCH_FREQUENCY = ['instant', 'daily', 'off'];

// v1.20: không thuộc ENUMS (GET /meta/enums vẫn 12 enum)
export const INTERVIEW_MODE = ['onsite', 'online'];
export const INTERVIEW_CONFIRMATION = ['pending', 'confirmed', 'reschedule_requested', 'cancelled'];
export const MESSAGE_SENDER = ['candidate', 'employer'];

// Các enum bổ sung được hợp đồng nêu ở mục 6 / 7
export const COMPANY_SIZE = ['1-10', '11-50', '51-200', '201-500', '500+'];
export const CV_PARSE_STATUS = ['none', 'processing', 'done', 'failed'];

// Hằng số công thức chấm điểm (mục 7.2), dùng bởi module ai/matcher
export const MATCH = {
  WEIGHTS: { skillMatch: 0.5, semantic: 0.3, experienceEducation: 0.2 },
  REQUIRED_SKILL_WEIGHT: 0.8,
  NICE_TO_HAVE_WEIGHT: 0.2,
  // Giá trị tạm, cần tối ưu bằng bộ gold ở T8
  SEMANTIC_FLOOR: 0.7,
  SEMANTIC_RANGE: 0.2,
  EXPERIENCE_WEIGHT: 0.7,
  EDUCATION_WEIGHT: 0.3,
  NO_REQUIRED_MATCH_CAP: 40,
  EXPLANATION_MAX_LENGTH: 300,
  EXTRA_SKILLS_LIMIT: 10,
  RESULT_VERSION: 3, // tăng khi đổi cấu trúc MatchResult để cache cũ hết hiệu lực (v2: thêm skillLabels, v3: thêm semanticAvailable)
  LABELS: [
    { label: 'excellent', min: 80 },
    { label: 'good', min: 65 },
    { label: 'fair', min: 50 },
    { label: 'low', min: 0 },
  ],
};

// Giới hạn của nhóm /ai (mục 8.6, 10)
export const AI = {
  MAX_JOBS_TO_RANK: 300, // tối đa số tin mới nhất đưa vào so khớp trong /ai/recommendations
  MAX_PROFILES_TO_RANK: 300, // tối đa số hồ sơ công khai mới nhất đưa vào /ai/candidates-for-job
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 30,
};

// Tư vấn nghề nghiệp (mục 7.3, 8.6)
export const ADVICE = {
  MIN_MARKET_JOBS: 5, // dưới ngưỡng này thì mở rộng từ tin cùng vị trí ra cả category
  MAX_MARKET_JOBS: 300,
  TOP_SKILLS: 10, // số skill thị trường dùng tính readinessScore
  MAX_GAPS: 10,
  MAX_ROLES: 3,
  MAX_SUGGESTED_JOBS: 5,
  HIGH_PERCENT: 40,
  MEDIUM_PERCENT: 15,
  SUMMARY_MAX_LENGTH: 400,
  HISTORY_LIMIT: 10, // số bản tư vấn giữ lại mỗi user
  RESULT_VERSION: 1, // tăng khi đổi cấu trúc CareerAdvice để cache cũ hết hiệu lực
};

// Nhãn tin tuyển dụng tính ở API (v1.11): Mới = đăng chưa quá NEW_DAYS ngày, Gấp = hạn nộp còn dưới URGENT_DAYS ngày,
// Hot = đủ số đơn hoặc số lượt xem
export const JOB_LABEL = { NEW_DAYS: 3, URGENT_DAYS: 7, HOT_APPLICATIONS: 40, HOT_VIEWS: 500 };
export const POSTED_WITHIN_DAYS = { '24h': 1, '7d': 7, '30d': 30 };
export const SIMILAR_JOBS = { LIMIT: 6, POOL: 60 };
// Tìm kiếm theo độ liên quan (v1.13): tối đa MAX_CANDIDATES tin khớp được chấm điểm trong Node rồi mới phân trang
export const SEARCH = {
  MAX_TOKENS: 6,
  MAX_CANDIDATES: 500,
  WEIGHT: { TITLE_PHRASE: 40, TITLE_PREFIX: 10, TITLE: 100, SKILL: 40, COMPANY: 25, DESCRIPTION: 10 },
};

// Xác minh danh tính và chống lạm dụng (v1.14)
export const COMPANY_VERIFICATION_STATUS = ['unverified', 'pending', 'verified', 'rejected'];
export const REPORT_REASON = ['scam', 'incorrect', 'duplicate', 'other'];
export const REPORT_STATUS = ['open', 'dismissed', 'resolved'];
export const VERIFICATION = {
  EMAIL_TOKEN_HOURS: 24,
  OTP_DIGITS: 6,
  OTP_MINUTES: 5,
  OTP_MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN_SECONDS: 60, // khoảng cách tối thiểu giữa hai lần gửi thư / mã cho cùng một người
  RESEND_MAX_PER_HOUR: 5,
  PURGE_DAYS: 7, // bản ghi token hết hạn được giữ thêm để báo "hết hạn" thay vì "không hợp lệ"
};
// v1.16: quên mật khẩu và bảo mật tài khoản
export const ACCOUNT_SECURITY = {
  RESET_TOKEN_MINUTES: 60, // hạn đường dẫn đặt lại mật khẩu
  RESET_COOLDOWN_SECONDS: 60, // cùng một tài khoản: yêu cầu thứ hai trong khoảng này không gửi thêm thư
  RECENT_LOGIN_MINUTES: 10, // tài khoản chỉ có Google đặt mật khẩu lần đầu phải vừa đăng nhập trong khoảng này
};
export const LIMITS = {
  APPLICATIONS_PER_DAY: 30, // mỗi ứng viên
  UNVERIFIED_JOB_SUBMISSIONS_PER_DAY: 3, // mỗi công ty chưa verified, tính số lần gửi duyệt trong 24 giờ
  REPORTS_PER_DAY: 10, // mỗi người dùng
  REPORT_DETAIL_MAX: 1000,
  SAVED_SEARCHES_PER_USER: 10, // v1.19
  FOLLOWS_PER_USER: 100, // v1.19
  // v1.20: tin nhắn trong hồ sơ ứng tuyển
  MESSAGE_MAX: 2000,
  MESSAGES_PER_WINDOW: 10, // mỗi người gửi, mỗi đơn
  MESSAGE_WINDOW_MINUTES: 10,
  CANDIDATE_MESSAGES_BEFORE_REPLY: 3, // ứng viên gửi tối đa chừng này tin khi nhà tuyển dụng chưa trả lời
};

// Hồ sơ ứng tuyển: đánh giá, phỏng vấn, lý do từ chối (v1.20)
export const HIRING = {
  NOTE_MAX: 2000,
  REASON_MAX: 500,
  INTERVIEW_MESSAGE_MAX: 1000,
  INTERVIEW_LOCATION_MAX: 300,
  INTERVIEW_RESPONSE_NOTE_MAX: 500,
  INTERVIEW_MAX_DAYS_AHEAD: 365,
  INTERVIEW_DEFAULT_MINUTES: 60,
  UPCOMING_DEFAULT: 5,
  UPCOMING_MAX: 20,
  MESSAGES_PAGE: 50,
};

// Báo việc mới và theo dõi công ty (v1.19)
export const ALERTS = {
  MAX_EMAILS_PER_DAY: 10, // email tức thời tối đa mỗi người / 24 giờ, quá thì chuyển vào thư tổng hợp
  DIGEST_MAX_JOBS: 10, // số tin liệt kê trong một thư tổng hợp
  NEW_BADGE_DAYS: 7, // huy hiệu "Mới": tin đã được báo cho người dùng trong khoảng này
  TOKEN_DAYS: 180, // hạn token hủy đăng ký trong email
  PURGE_DAYS: 7,
  SEARCH_NAME_MAX: 80,
  BATCH_JOBS: 200, // số tin tối đa xử lý mỗi lần quét
};

export const PAGINATION = { DEFAULT_PAGE: 1, DEFAULT_LIMIT: 10, MAX_LIMIT: 50 };

export const ENUMS = {
  ROLES,
  USER_STATUS,
  JOB_STATUS,
  APPLICATION_STATUS,
  EMPLOYMENT_TYPE,
  WORK_MODE,
  LEVEL,
  EDUCATION,
  JOB_CATEGORY,
  SKILL_TYPE,
  SKILL_LEVEL,
  NOTIFICATION_TYPE,
};

// Mã lỗi (mục 5.1) -> HTTP status
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE_APPLICATION: 409,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  CV_REQUIRED: 422,
  CONSENT_REQUIRED: 422, // v1.23
  INSUFFICIENT_POINTS: 402, // v1.25
  CV_UNREADABLE: 422,
  JOB_NOT_OPEN: 422,
  INVALID_STATUS_TRANSITION: 422,
  AI_PARSE_FAILED: 422,
  RATE_LIMITED: 429,
  EMAIL_NOT_VERIFIED: 403,
  PHONE_REQUIRED: 422,
  PHONE_NOT_VERIFIED: 403,
  TOKEN_INVALID: 400,
  TOKEN_EXPIRED: 400,
  REAUTH_REQUIRED: 403,
  AI_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  INTERNAL_ERROR: 500,
};

// Công cụ AI cho ứng viên (v1.21, mục 7.8). Không thuộc ENUMS (GET /meta/enums vẫn 12 enum)
export const AI_TOOLS = {
  RESULT_VERSION: 1, // tăng khi đổi cấu trúc kết quả để cache cũ hết hiệu lực
  CV_MIN_WORDS: 150,
  CV_MAX_WORDS: 900,
  LETTER_WORDS: { short: 120, medium: 200, long: 300 },
  TONES: ['formal', 'friendly', 'concise'],
  LENGTHS: ['short', 'medium', 'long'],
  INTERVIEW_TYPES: ['technical', 'behavioral', 'situational'],
  QUESTIONS_MIN: 8,
  QUESTIONS_MAX: 10,
  SUGGESTIONS_MIN: 3,
  SUGGESTIONS_MAX: 5,
  HISTORY_PER_JOB: 5, // số bản giữ lại cho mỗi (người dùng, công cụ, tin)
  ANSWER_MIN: 10,
  ANSWER_MAX: 3000,
  USAGE_UTC_OFFSET_HOURS: 7, // ngày tính hạn mức theo giờ Việt Nam
};

// Chống lạm dụng chi phí AI (v1.23, mục 7.9)
export const AI_TOOL_NAMES = [
  'cv_parse',
  'match_explain',
  'career_advice',
  'cv_review',
  'cover_letter',
  'interview_set',
  'interview_answer',
  'embedding', // v1.24: mọi lời gọi embed cũng qua cầu dao (mục 7.9)
];
export const AI_LIMITS = {
  WARN_PERCENT: 80, // cảnh báo admin khi cầu dao đạt ngưỡng này
  // Trần độ dài system + prompt gửi LLM (ký tự) và số token đầu ra, theo công cụ
  PROMPT_MAX_CHARS: {
    cv_parse: 16000,
    match_explain: 4000,
    career_advice: 30000,
    cv_review: 14000,
    cover_letter: 12000,
    interview_set: 14000,
    interview_answer: 8000,
  },
  MAX_OUTPUT_TOKENS: {
    cv_parse: 6144,
    match_explain: 1024,
    career_advice: 4096,
    cv_review: 4096,
    cover_letter: 3072,
    interview_set: 4096,
    interview_answer: 2048,
  },
  DEFAULT_MAX_OUTPUT_TOKENS: 4096, // lời gọi không khai báo tool
  STATS_DEFAULT_DAYS: 14,
  STATS_MAX_DAYS: 30,
  TOP_USERS: 10,
};

// Quyền riêng tư (v1.23, mục 8.15)
export const PRIVACY = {
  TERMS_VERSION: '2026-10-26', // tăng khi Điều khoản / Quyền riêng tư đổi nội dung
  EXPORT_PER_HOUR: 3,
  DELETE_PER_HOUR: 5,
  EXPORT_NOTIFICATIONS_MAX: 500,
  NOTIFICATION_TTL_DAYS: 180,
  ALERT_TTL_DAYS: 90,
  AI_STATS_TTL_DAYS: 90,
  AI_USER_DAILY_TTL_DAYS: 14,
  REVOKED_TOKEN_KEEP_DAYS: 7,
  DELETED_NAME: {
    candidate: 'Ứng viên đã xóa tài khoản',
    employer: 'Nhà tuyển dụng đã xóa tài khoản',
    admin: 'Quản trị viên đã xóa tài khoản',
  },
  DELETED_MESSAGE: '(Tin nhắn đã bị xóa)',
  EMPLOYER_CLOSED_REASON: 'Nhà tuyển dụng đã đóng tài khoản',
};

// SEO (v1.24, mục 8.10): sitemap.xml và robots.txt
export const SITEMAP = {
  MAX_URLS: 45000, // giới hạn của chuẩn sitemaps.org là 50.000
  CACHE_SECONDS: 3600,
  STATIC_PATHS: ['/', '/jobs', '/companies', '/guides', '/employers', '/about', '/contact', '/faq', '/terms', '/privacy'],
  // Phải trùng slug các bài trong frontend/src/content/guides (có test đối chiếu)
  GUIDE_SLUGS: [
    'viet-cv-dung-cach',
    'tra-loi-phong-van',
    'thuong-luong-luong',
    'lo-trinh-frontend',
    'lo-trinh-backend',
    'lo-trinh-data-ai',
    'nhan-biet-tin-tuyen-dung-lua-dao',
    'ky-nang-cho-sinh-vien-moi-ra-truong',
  ],
  // Khu riêng tư hoặc không có giá trị tìm kiếm: chặn trong robots.txt
  DISALLOW: [
    '/admin', '/api', '/candidate', '/employer', '/account', '/notifications',
    '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/unsubscribe',
  ],
};

// Ví điểm (v1.25, mục 7.10, 8.16). Giá và gói nạp nằm ở config/pricing.js (đọc từ biến môi trường), không ở đây
export const WALLET = {
  TX_TYPES: ['topup', 'spend', 'refund', 'bonus', 'adjust'],
  ORDER_STATUS: ['pending', 'success', 'failed', 'expired', 'cancelled'],
  TOOLS: ['cv_review', 'cover_letter', 'interview_set', 'interview_answer'], // công cụ AI tính điểm
  HOLD_TTL_DAYS: 30, // giữ dòng giữ chỗ đã kết thúc thêm chừng này ngày
  ADJUST_MAX_POINTS: 100000,
  REPORT_MAX_DAYS: 366,
  SANDBOX_NOTICE: 'Môi trường thử nghiệm, không thu tiền thật',
  EXPORT_TX_MAX: 5000,
};

// Tự đăng tin cho công ty đã xác minh và kiểm duyệt (v1.27, mục 7.11)
export const PENDING_REASON = [
  'unverified_company',
  'email_unverified',
  'company_flagged',
  'auto_publish_off',
  'recent_violations',
  'content_flags',
  'reported',
];
export const AUTO_FLAG = [
  'phone',
  'email',
  'external_link',
  'social',
  'banned_keyword',
  'scam_keyword',
  'salary_anomaly',
  'duplicate',
  'title_caps',
  'title_short',
];
export const PUBLISH_SOURCE = ['auto', 'manual'];
export const MODERATION_ACTION = [
  'auto_published',
  'sent_to_review',
  'approved',
  'rejected',
  'removed',
  'edited',
  'edit_to_review',
  'reported_to_review',
  'company_flagged',
  'company_unflagged',
  'verification_revoked',
  'settings_changed',
];
export const MODERATION_VIOLATION_ACTIONS = ['rejected', 'removed'];

export const AUTO_PUBLISH = {
  DUPLICATE_DAYS: 7,
  DUPLICATE_POOL: 300, // số tin gần nhất đem so độ giống
  SHINGLE_WORDS: 3,
  TITLE_MIN_CHARS: 6,
  TITLE_CAPS_MIN_LETTERS: 5,
  MIN_MONTHLY_FULL_TIME_VND: 1000000,
  MAX_SALARY_RATIO: 4,
  USD_TO_VND: 25000,
  EVENTS_PAGE: 100,
  // Lương tối đa hợp lý mỗi tháng (VND) theo cấp bậc; vượt thì gắn `salary_anomaly`
  SALARY_CAP_BY_LEVEL: {
    intern: 15000000,
    fresher: 25000000,
    junior: 40000000,
    middle: 70000000,
    senior: 120000000,
    lead: 180000000,
    manager: 250000000,
  },
  // Từ khóa (không dấu, viết thường). So khớp trên dạng đã chuẩn hóa, xem autoCheck.js
  BANNED_KEYWORDS: [
    'ca cuoc', 'co bac', 'danh bac', 'lo de', 'casino', 'nha cai', 'cho vay nang lai', 'tin dung den',
    'ma tuy', 'mua dam', 'ban dam',
  ],
  SCAM_KEYWORDS: [
    'da cap', 'mlm', 'dat coc', 'dat cok', 'tien coc', 'phi ho so', 'phi dao tao', 'phi tuyen dung', 'phi giu cho',
    'dong tien truoc', 'chuyen khoan truoc', 'viec nhe luong cao', 'luong cao viec nhe', 'viec nhe luong khung',
    'kiem tien online', 'lam tai nha thu nhap', 'thu nhap thu dong', 'thu nhap khung', 'khong can von', 'lam giau',
    'cay thue', 'like share', 'click chuot', 'cam ket thu nhap', 'hoan tien coc', 'dau tu sinh loi',
  ],
  SOCIAL_APPS: ['zalo', 'telegram', 'whatsapp', 'viber', 'wechat', 'skype'],
  SOCIAL_NETWORKS: ['facebook', 'instagram', 'tiktok', 'messenger', 'fb'],
  CONTACT_WORDS: [
    'lien he', 'ket ban', 'add', 'inbox', 'nhan tin', 'chat', 'ib', 'sdt', 'goi', 'contact', 'gui cv', 'gui ho so',
    'id', 'user', 'acc', 'tai khoan', 'follow', 'trang ca nhan', 'fanpage', 'link',
  ],
  TLDS: [
    'com', 'vn', 'net', 'org', 'io', 'me', 'ly', 'info', 'biz', 'xyz', 'top', 'site', 'link', 'online', 'shop',
    'club', 'vip', 'cc', 'tv', 'gl', 'ai', 'app', 'dev', 'store', 'work',
  ],
};
