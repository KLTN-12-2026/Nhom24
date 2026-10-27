import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

dotenv.config({ path: path.join(backendDir, '.env') });

const str = (key, def) => (process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : def);
const num = (key, def) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && process.env[key] !== undefined && process.env[key] !== '' ? n : def;
};
const bool = (key, def) => {
  const v = process.env[key];
  return v === undefined || v === '' ? def : v.toLowerCase() === 'true';
};

const NODE_ENV = str('NODE_ENV', 'development');

export const env = {
  NODE_ENV,
  isProd: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  PORT: num('PORT', 5000),
  MONGODB_URI: str('MONGODB_URI', 'mongodb://127.0.0.1:27017/recruitment_ai'),
  CLIENT_URL: str('CLIENT_URL', 'http://localhost:5173'),
  SITE_URL: str('SITE_URL', ''), // v1.24: địa chỉ công khai của site cho sitemap.xml / robots.txt; trống thì dùng CLIENT_URL

  JWT_ACCESS_SECRET: str('JWT_ACCESS_SECRET', 'change_me_access'),
  JWT_REFRESH_SECRET: str('JWT_REFRESH_SECRET', 'change_me_refresh'),
  JWT_ACCESS_EXPIRES: str('JWT_ACCESS_EXPIRES', '2h'),
  JWT_REFRESH_EXPIRES: str('JWT_REFRESH_EXPIRES', '7d'),

  AUTO_APPROVE_JOBS: bool('AUTO_APPROVE_JOBS', false),
  // v1.27: công ty đã xác minh được đăng tin ngay khi qua bộ kiểm tra tự động (mục 7.11); admin ghi đè lúc chạy (appSettings)
  AUTO_PUBLISH_VERIFIED: bool('AUTO_PUBLISH_VERIFIED', true),
  AUTO_PUBLISH_MAX_VIOLATIONS: Math.min(20, Math.max(0, Math.floor(num('AUTO_PUBLISH_MAX_VIOLATIONS', 1)))),
  AUTO_PUBLISH_VIOLATION_DAYS: Math.min(365, Math.max(1, Math.floor(num('AUTO_PUBLISH_VIOLATION_DAYS', 30)))),
  AUTO_PUBLISH_REPORT_THRESHOLD: Math.min(50, Math.max(1, Math.floor(num('AUTO_PUBLISH_REPORT_THRESHOLD', 3)))),
  AUTO_PUBLISH_SIMILARITY: Math.min(1, Math.max(0.5, num('AUTO_PUBLISH_SIMILARITY', 0.85))),

  backendDir,
  UPLOAD_DIR: path.resolve(backendDir, str('UPLOAD_DIR', 'uploads')),
  MAX_CV_SIZE_MB: num('MAX_CV_SIZE_MB', 5),
  MAX_LOGO_SIZE_MB: num('MAX_LOGO_SIZE_MB', 2), // v1.22: áp cho mọi ảnh (logo, bìa, đại diện)
  IMAGE_UPLOADS_PER_HOUR: Math.max(1, Math.floor(num('IMAGE_UPLOADS_PER_HOUR', 20))),

  LLM_PROVIDER: str('LLM_PROVIDER', 'gemini'),
  LLM_API_KEY: str('LLM_API_KEY', ''),
  LLM_MODEL: str('LLM_MODEL', 'gemini-3.8-flash'),
  LLM_FALLBACK_MODEL: str('LLM_FALLBACK_MODEL', ''), // tùy chọn: thử một lần khi model chính vẫn 429/503 sau khi hết retry
  EMBEDDING_MODEL: str('EMBEDDING_MODEL', 'gemini-embedding-001'),
  EMBEDDING_API_KEY: str('EMBEDDING_API_KEY', ''), // trống thì embedding dùng LLM_API_KEY (khi LLM_PROVIDER=gemini)
  EMBEDDING_DIM: num('EMBEDDING_DIM', 768),
  LLM_TIMEOUT_MS: num('LLM_TIMEOUT_MS', 60000),
  LLM_MAX_RETRIES: num('LLM_MAX_RETRIES', 2),

  AI_RATE_LIMIT_PER_HOUR: num('AI_RATE_LIMIT_PER_HOUR', 30),
  // v1.21: số lượt AI mỗi người mỗi ngày (giờ Việt Nam) cho chấm CV, thư xin việc, luyện phỏng vấn
  AI_TOOLS_DAILY_LIMIT: Math.max(0, Math.floor(num('AI_TOOLS_DAILY_LIMIT', 10))),

  // v1.23: chống lạm dụng chi phí AI (mục 7.9) và quyền riêng tư
  AI_GLOBAL_DAILY_LIMIT: Math.max(0, Math.floor(num('AI_GLOBAL_DAILY_LIMIT', 500))),
  AI_IP_HOURLY_LIMIT: Math.max(1, Math.floor(num('AI_IP_HOURLY_LIMIT', 60))),
  AI_DEVICE_HOURLY_LIMIT: Math.max(1, Math.floor(num('AI_DEVICE_HOURLY_LIMIT', 40))),
  AI_BURST_PER_MINUTE: Math.max(1, Math.floor(num('AI_BURST_PER_MINUTE', 6))),
  REGISTER_DEVICE_PER_HOUR: Math.max(1, Math.floor(num('REGISTER_DEVICE_PER_HOUR', 5))),
  TRUST_PROXY: Math.max(0, Math.floor(num('TRUST_PROXY', 0))),
  PRIVACY_HASH_SECRET: str('PRIVACY_HASH_SECRET', ''), // trống: dùng JWT_ACCESS_SECRET

  // v1.14: xác minh danh tính. Thư và SMS đi qua lớp provider (src/providers), chế độ mặc định chỉ ghi ra log máy chủ.
  MAIL_PROVIDER: str('MAIL_PROVIDER', 'log'), // log | smtp
  MAIL_FROM: str('MAIL_FROM', 'Tuyển dụng AI <no-reply@localhost>'),
  SMTP_HOST: str('SMTP_HOST', ''),
  SMTP_PORT: num('SMTP_PORT', 587),
  SMTP_SECURE: bool('SMTP_SECURE', false),
  SMTP_USER: str('SMTP_USER', ''),
  SMTP_PASS: str('SMTP_PASS', ''),
  SMS_PROVIDER: str('SMS_PROVIDER', 'mock'), // mock (ghi ra log) | tên provider đăng ký bằng registerSmsProvider
  REQUIRE_PHONE_OTP: bool('REQUIRE_PHONE_OTP', false),
  MAX_LICENSE_SIZE_MB: num('MAX_LICENSE_SIZE_MB', 5),

  // v1.15: đăng nhập bằng Google (Client ID kiểu OAuth Web). Trống thì POST /auth/google trả NOT_IMPLEMENTED.
  GOOGLE_CLIENT_ID: str('GOOGLE_CLIENT_ID', ''),

  // v1.19: báo việc mới và theo dõi công ty. Lịch chạy nằm trong tiến trình server, mặc định tắt.
  ENABLE_SCHEDULER: bool('ENABLE_SCHEDULER', false),
  ALERTS_INTERVAL_MINUTES: Math.max(1, num('ALERTS_INTERVAL_MINUTES', 15)),
  ALERTS_DIGEST_HOUR: Math.min(23, Math.max(0, num('ALERTS_DIGEST_HOUR', 8))),
  ALERTS_LOOKBACK_HOURS: Math.max(1, num('ALERTS_LOOKBACK_HOURS', 48)),

  // v1.25: ví điểm và nạp tiền. Khóa bí mật của cổng chỉ đọc từ biến môi trường.
  WALLET_ENABLED: bool('WALLET_ENABLED', true),
  WALLET_VND_PER_POINT: Math.max(1, Math.floor(num('WALLET_VND_PER_POINT', 1000))),
  WALLET_PACKAGES: str('WALLET_PACKAGES', ''), // JSON [{ id, points, bonusPoints }]; trống: gói mặc định
  WALLET_PRICE_CV_REVIEW: Math.max(0, Math.floor(num('WALLET_PRICE_CV_REVIEW', 2))),
  WALLET_PRICE_COVER_LETTER: Math.max(0, Math.floor(num('WALLET_PRICE_COVER_LETTER', 2))),
  WALLET_PRICE_INTERVIEW_SET: Math.max(0, Math.floor(num('WALLET_PRICE_INTERVIEW_SET', 3))),
  WALLET_PRICE_INTERVIEW_ANSWER: Math.max(0, Math.floor(num('WALLET_PRICE_INTERVIEW_ANSWER', 1))),
  WALLET_AI_COST_VND: Math.max(0, num('WALLET_AI_COST_VND', 400)),
  WALLET_ORDER_TTL_MINUTES: Math.max(1, num('WALLET_ORDER_TTL_MINUTES', 15)),
  WALLET_MAX_PENDING_ORDERS: Math.max(1, Math.floor(num('WALLET_MAX_PENDING_ORDERS', 3))),
  WALLET_ORDERS_PER_HOUR: Math.max(1, Math.floor(num('WALLET_ORDERS_PER_HOUR', 10))),
  WALLET_CALLBACK_PER_MINUTE: Math.max(1, Math.floor(num('WALLET_CALLBACK_PER_MINUTE', 60))),
  WALLET_HOLD_STALE_MINUTES: Math.max(1, num('WALLET_HOLD_STALE_MINUTES', 10)),
  WALLET_MAINTENANCE_MINUTES: Math.max(1, num('WALLET_MAINTENANCE_MINUTES', 5)),
  PAYMENT_PROVIDER: str('PAYMENT_PROVIDER', 'mock'), // mock | vnpay
  PAYMENT_MOCK_SECRET: str('PAYMENT_MOCK_SECRET', ''), // trống: suy ra từ JWT_ACCESS_SECRET
  VNPAY_TMN_CODE: str('VNPAY_TMN_CODE', ''),
  VNPAY_HASH_SECRET: str('VNPAY_HASH_SECRET', ''),
  VNPAY_PAY_URL: str('VNPAY_PAY_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
  VNPAY_RETURN_URL: str('VNPAY_RETURN_URL', ''), // trống: {CLIENT_URL}/candidate/wallet/result
};

if (env.isProd) {
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (env[key].startsWith('change_me')) {
      throw new Error(`Biến môi trường ${key} phải được đặt giá trị bí mật khi chạy production`);
    }
  }
}
