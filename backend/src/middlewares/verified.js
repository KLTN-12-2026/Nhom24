import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/** Chưa xác minh email thì không được nộp đơn, đăng hoặc gửi duyệt tin (v1.14) */
export function assertEmailVerified(user) {
  if (!user.emailVerified) {
    throw new ApiError(
      'EMAIL_NOT_VERIFIED',
      'Bạn cần xác minh email trước khi thực hiện thao tác này. Hãy kiểm tra hộp thư hoặc gửi lại thư xác minh.',
    );
  }
}

/** Khi bật REQUIRE_PHONE_OTP, số điện thoại phải được xác minh bằng mã OTP trước các thao tác nộp đơn / đăng tin */
export function assertPhoneVerified(user) {
  if (!env.REQUIRE_PHONE_OTP || user.phoneVerified) return;
  if (!user.phone) throw new ApiError('PHONE_REQUIRED', 'Bạn cần nhập số điện thoại để tiếp tục');
  throw new ApiError('PHONE_NOT_VERIFIED', 'Bạn cần xác minh số điện thoại bằng mã OTP trước khi thực hiện thao tác này');
}

export const requireVerifiedEmail = (req, res, next) => {
  try {
    assertEmailVerified(req.user);
    next();
  } catch (err) {
    next(err);
  }
};
