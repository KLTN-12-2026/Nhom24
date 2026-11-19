import rateLimit from 'express-rate-limit';
import { PRIVACY } from '../config/constants.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { hashDevice, hashIp } from '../utils/privacy.js';

const handler = (message) => (req, res, next) => next(new ApiError('RATE_LIMITED', message));

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
};

/** Tạo bộ giới hạn: `key` quyết định đếm theo gì (mặc định theo IP). Test truyền `skip: () => false` để bật lại. */
export const createLimiter = ({ windowMs, limit, message, key, skip }) =>
  rateLimit({
    ...base,
    ...(skip && { skip }),
    windowMs,
    limit,
    ...(key && { keyGenerator: key }),
    handler: handler(message),
  });

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
// v1.23: khóa đếm theo IP luôn là bản băm, không giữ IP thô trong bộ nhớ (CONTRACT 7.9)
const ipKey = (req) => hashIp(req.ip);
const userKey = (req) => `u:${req.user?.id ?? hashIp(req.ip)}`;
const emailKey = (req) => `e:${String(req.body?.email ?? '').trim().toLowerCase() || hashIp(req.ip)}`;
/** Chạy lần lượt các middleware, dừng ở lỗi đầu tiên */
const chain = (...middlewares) => (req, res, next) => {
  let i = 0;
  const step = (err) => (err || i >= middlewares.length ? next(err) : middlewares[i++](req, res, step));
  step();
};

/** Đăng nhập: 10 lần / 15 phút / IP (mục 9) và 10 lần / 15 phút / email (v1.14) */
export const loginLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  key: ipKey,
  message: 'Bạn đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút',
});
export const loginAccountLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  key: emailKey,
  message: 'Tài khoản này đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút',
});

/** Cổng đăng nhập admin (v1.18): 5 lần / 15 phút / IP, chặt hơn đăng nhập thường; chỉ đếm theo IP để không ai khóa được tài khoản admin từ xa */
export const adminLoginLimiterOptions = {
  windowMs: 15 * MINUTE,
  limit: 5,
  key: ipKey,
  message: 'Bạn thử đăng nhập quá nhiều lần, vui lòng thử lại sau 15 phút',
};
export const adminLoginLimiter = createLimiter(adminLoginLimiterOptions);

/** Đăng nhập bằng Google (v1.15): 20 lần / 15 phút / IP */
export const googleLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  key: ipKey,
  message: 'Bạn thử đăng nhập bằng Google quá nhiều lần, vui lòng thử lại sau 15 phút',
});

/** Đăng ký: 10 lần / giờ / IP và 5 lần / giờ / email */
export const registerLimiter = createLimiter({
  windowMs: HOUR,
  limit: 10,
  key: ipKey,
  message: 'Bạn đăng ký quá nhiều lần, vui lòng thử lại sau',
});
export const registerAccountLimiter = createLimiter({
  windowMs: HOUR,
  limit: 5,
  key: emailKey,
  message: 'Email này đã được thử đăng ký quá nhiều lần, vui lòng thử lại sau',
});

/** Gửi lại thư xác minh / gửi mã OTP: theo IP (20 / giờ) và theo tài khoản (10 / giờ, đặt sau `auth`) */
export const resendIpLimiter = createLimiter({
  windowMs: HOUR,
  limit: 20,
  key: ipKey,
  message: 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau',
});
export const resendAccountLimiter = createLimiter({
  windowMs: HOUR,
  limit: 10,
  key: userKey,
  message: 'Bạn gửi yêu cầu quá nhiều lần, vui lòng thử lại sau',
});

/** Xác minh bằng mã / token: chặn dò (30 lần / 15 phút / IP) */
export const verifyLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 30,
  key: ipKey,
  message: 'Bạn thử quá nhiều lần, vui lòng thử lại sau',
});

/** Quên mật khẩu (v1.16): 10 lần / giờ / IP và 3 lần / giờ / email. Đếm theo chuỗi email nên không lộ email có tồn tại hay không */
export const forgotIpLimiter = createLimiter({
  windowMs: HOUR,
  limit: 10,
  key: ipKey,
  message: 'Bạn yêu cầu đặt lại mật khẩu quá nhiều lần, vui lòng thử lại sau',
});
export const forgotEmailLimiter = createLimiter({
  windowMs: HOUR,
  limit: 3,
  key: emailKey,
  message: 'Email này đã được yêu cầu đặt lại mật khẩu quá nhiều lần, vui lòng thử lại sau',
});

/** Đổi / đặt mật khẩu: 10 lần / 15 phút / tài khoản, chặn dò mật khẩu hiện tại. Đặt sau `auth`. */
export const passwordChangeLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  key: userKey,
  message: 'Bạn đổi mật khẩu quá nhiều lần, vui lòng thử lại sau 15 phút',
});

/** Theo dõi công ty, tìm kiếm đã lưu, cài đặt thông báo (v1.19): 60 lần ghi / giờ / tài khoản. Đặt sau `auth`. */
export const engagementLimiter = createLimiter({
  windowMs: HOUR,
  limit: 60,
  key: userKey,
  message: 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau',
});

/** Gửi tin nhắn trong hồ sơ ứng tuyển (v1.20): 60 tin / giờ / tài khoản. Đặt sau `auth`. Giới hạn theo từng đơn nằm ở service. */
export const messageLimiter = createLimiter({
  windowMs: HOUR,
  limit: 60,
  key: userKey,
  message: 'Bạn gửi tin nhắn quá nhanh, vui lòng thử lại sau',
});

/** Tải ảnh logo / bìa / đại diện (v1.22): IMAGE_UPLOADS_PER_HOUR / giờ / tài khoản. Đặt sau `auth`, trước multer. */
export const imageUploadLimiterOptions = {
  windowMs: HOUR,
  limit: env.IMAGE_UPLOADS_PER_HOUR,
  key: userKey,
  message: 'Bạn tải ảnh lên quá nhiều lần, vui lòng thử lại sau',
};
export const imageUploadLimiter = createLimiter(imageUploadLimiterOptions);

/**
 * Đăng ký / Google (v1.23): thêm giới hạn theo mã thiết bị. Mã thiết bị do client gửi (X-Device-Id) nên chỉ là lớp phụ:
 * không có mã hợp lệ thì bỏ qua, giới hạn theo IP mới là lớp cứng.
 */
export const deviceKey = (req) => `d:${hashDevice(req)}`;
export const registerDeviceLimiter = createLimiter({
  windowMs: HOUR,
  limit: () => env.REGISTER_DEVICE_PER_HOUR,
  key: deviceKey,
  skip: (req) => env.isTest || !hashDevice(req),
  message: 'Thiết bị này đăng ký quá nhiều lần, vui lòng thử lại sau',
});

/** Nhóm /ai và upload CV (v1.23, CONTRACT 7.9): bùng nổ theo phút / người, theo thiết bị, theo IP, rồi theo giờ / người. Đặt sau `auth`. */
export const aiBurstLimiter = createLimiter({
  windowMs: MINUTE,
  limit: () => env.AI_BURST_PER_MINUTE,
  key: (req) => `b:${req.user?.id ?? hashIp(req.ip)}`,
  message: 'Bạn thao tác quá nhanh, vui lòng chờ một chút rồi thử lại',
});
export const aiDeviceLimiter = createLimiter({
  windowMs: HOUR,
  limit: () => env.AI_DEVICE_HOURLY_LIMIT,
  key: deviceKey,
  skip: (req) => env.isTest || !hashDevice(req),
  message: 'Thiết bị này đã dùng quá nhiều lượt AI trong một giờ',
});
export const aiIpLimiter = createLimiter({
  windowMs: HOUR,
  limit: () => env.AI_IP_HOURLY_LIMIT,
  key: ipKey,
  message: 'Địa chỉ mạng này đã dùng quá nhiều lượt AI trong một giờ',
});
export const aiHourlyLimiter = rateLimit({
  ...base,
  windowMs: HOUR,
  limit: () => env.AI_RATE_LIMIT_PER_HOUR,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  handler: handler('Bạn đã vượt quá số lượt dùng tính năng AI trong một giờ'),
});
export const aiLimiter = chain(aiBurstLimiter, aiDeviceLimiter, aiIpLimiter, aiHourlyLimiter);

/** Xuất dữ liệu và xóa tài khoản (v1.23): theo tài khoản, cũng chặn dò mật khẩu. Đặt sau `auth`. */
export const exportLimiter = createLimiter({
  windowMs: HOUR,
  limit: PRIVACY.EXPORT_PER_HOUR,
  key: userKey,
  message: 'Bạn tải dữ liệu quá nhiều lần, vui lòng thử lại sau',
});
export const deleteAccountLimiter = createLimiter({
  windowMs: HOUR,
  limit: PRIVACY.DELETE_PER_HOUR,
  key: userKey,
  message: 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau',
});

/** Ví điểm (v1.25): tạo đơn nạp / giả lập thanh toán theo tài khoản (đặt sau `auth`); callback và return theo IP đã băm */
export const walletOrderLimiter = createLimiter({
  windowMs: HOUR,
  limit: () => env.WALLET_ORDERS_PER_HOUR,
  key: userKey,
  message: 'Bạn tạo đơn nạp quá nhiều lần, vui lòng thử lại sau',
});
export const walletCallbackLimiter = createLimiter({
  windowMs: MINUTE,
  limit: () => env.WALLET_CALLBACK_PER_MINUTE,
  key: ipKey,
  message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
});
