import crypto from 'node:crypto';
import { ACCOUNT_SECURITY, VERIFICATION } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { RefreshToken, User, VerificationToken } from '../../models/index.js';
import { sendMail } from '../../providers/mail/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword, sha256 } from '../../utils/hash.js';

const TYPE = 'password_reset';
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Luôn trả đúng nội dung này, dù email có tài khoản hay không (chống dò tài khoản)
export const FORGOT_PASSWORD_MESSAGE =
  'Nếu email này có tài khoản, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (cả thư rác).';

/**
 * Tạo token đặt lại và gửi thư. Mọi nhánh (không có tài khoản, tài khoản bị khóa, vừa gửi cách đây chưa lâu)
 * đều trả cùng một kết quả để không lộ email có tồn tại hay không. Lỗi gửi thư chỉ log (sendMail không ném lỗi).
 */
export async function requestPasswordReset({ email }) {
  const user = await User.findOne({ email });
  if (user && user.status !== 'locked') {
    const last = await VerificationToken.findOne({ userId: user._id, type: TYPE })
      .sort({ createdAt: -1 })
      .select('createdAt');
    const cooling = last && Date.now() - last.createdAt.getTime() < ACCOUNT_SECURITY.RESET_COOLDOWN_SECONDS * 1000;
    if (!cooling) {
      const token = crypto.randomBytes(32).toString('base64url');
      // Token mới thay token cũ chưa dùng
      await VerificationToken.updateMany(
        { userId: user._id, type: TYPE, consumedAt: null, revokedAt: null },
        { revokedAt: new Date() },
      );
      const expiresAt = new Date(Date.now() + ACCOUNT_SECURITY.RESET_TOKEN_MINUTES * MINUTE_MS);
      await VerificationToken.create({
        userId: user._id,
        type: TYPE,
        tokenHash: sha256(token),
        expiresAt,
        purgeAt: new Date(expiresAt.getTime() + VERIFICATION.PURGE_DAYS * DAY_MS),
      });
      const link = `${env.CLIENT_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
      // Không chờ gửi thư để thời gian phản hồi không khác nhau giữa email có và không có tài khoản
      void sendMail({
        to: user.email,
        subject: 'Đặt lại mật khẩu tài khoản Tuyển dụng AI',
        text: [
          `Chào ${user.fullName},`,
          '',
          `Có yêu cầu đặt lại mật khẩu cho tài khoản này. Mở đường dẫn sau để đặt mật khẩu mới (dùng được một lần, có hiệu lực trong ${ACCOUNT_SECURITY.RESET_TOKEN_MINUTES} phút):`,
          link,
          '',
          'Nếu bạn không yêu cầu, hãy bỏ qua thư này, mật khẩu hiện tại vẫn giữ nguyên.',
        ].join('\n'),
      });
    }
  }
  return { message: FORGOT_PASSWORD_MESSAGE };
}

export async function resetPassword({ token, password }) {
  const record = await VerificationToken.findOne({ type: TYPE, tokenHash: sha256(token) });
  if (!record || record.revokedAt) {
    throw new ApiError('TOKEN_INVALID', 'Đường dẫn đặt lại mật khẩu không hợp lệ hoặc đã được thay bằng đường dẫn mới hơn');
  }
  if (record.consumedAt) throw new ApiError('TOKEN_INVALID', 'Đường dẫn đặt lại mật khẩu đã được sử dụng');
  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError('TOKEN_EXPIRED', 'Đường dẫn đặt lại mật khẩu đã hết hạn, hãy yêu cầu đường dẫn mới');
  }
  const user = await User.findById(record.userId);
  if (!user) throw new ApiError('TOKEN_INVALID', 'Đường dẫn đặt lại mật khẩu không hợp lệ');
  if (user.status === 'locked') throw new ApiError('FORBIDDEN', 'Tài khoản đã bị khóa');

  // Dùng một lần, nguyên tử: hai request song song chỉ một request thắng
  const claimed = await VerificationToken.findOneAndUpdate(
    { _id: record._id, consumedAt: null, revokedAt: null },
    { consumedAt: new Date() },
  );
  if (!claimed) throw new ApiError('TOKEN_INVALID', 'Đường dẫn đặt lại mật khẩu đã được sử dụng');

  user.passwordHash = await hashPassword(password);
  // Mở được thư đặt lại nghĩa là làm chủ hộp thư
  if (user.emailVerified !== true) {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
  }
  await user.save();
  const now = new Date();
  await Promise.all([
    // Đăng xuất khỏi mọi thiết bị
    RefreshToken.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { revokedAt: now }),
    // Các đường dẫn đặt lại khác còn hiệu lực cũng vô hiệu
    VerificationToken.updateMany(
      { userId: user._id, type: TYPE, consumedAt: null, revokedAt: null },
      { revokedAt: now },
    ),
  ]);
  return { message: 'Đã đặt lại mật khẩu, vui lòng đăng nhập bằng mật khẩu mới' };
}
