import crypto from 'node:crypto';
import { VERIFICATION } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { User, VerificationToken } from '../../models/index.js';
import { sendMail } from '../../providers/mail/index.js';
import { sendSms } from '../../providers/sms/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sha256 } from '../../utils/hash.js';

const HOUR_MS = 60 * 60 * 1000;

/** Chống gửi dồn: tối thiểu RESEND_COOLDOWN_SECONDS giữa hai lần và RESEND_MAX_PER_HOUR lần mỗi giờ */
async function assertCanSend(userId, type) {
  const last = await VerificationToken.findOne({ userId, type }).sort({ createdAt: -1 }).select('createdAt');
  if (last) {
    const wait = Math.ceil((last.createdAt.getTime() + VERIFICATION.RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000);
    if (wait > 0) throw new ApiError('RATE_LIMITED', `Vui lòng chờ ${wait} giây trước khi gửi lại`);
  }
  const sent = await VerificationToken.countDocuments({
    userId,
    type,
    createdAt: { $gte: new Date(Date.now() - HOUR_MS) },
  });
  if (sent >= VERIFICATION.RESEND_MAX_PER_HOUR) {
    throw new ApiError('RATE_LIMITED', 'Bạn đã yêu cầu gửi quá nhiều lần trong một giờ, vui lòng thử lại sau');
  }
}

async function issue(userId, type, tokenHash, ttlMs, extra = {}) {
  // Token mới thay token cũ chưa dùng
  await VerificationToken.updateMany({ userId, type, consumedAt: null, revokedAt: null }, { revokedAt: new Date() });
  const expiresAt = new Date(Date.now() + ttlMs);
  return VerificationToken.create({
    userId,
    type,
    tokenHash,
    expiresAt,
    purgeAt: new Date(expiresAt.getTime() + VERIFICATION.PURGE_DAYS * 24 * HOUR_MS),
    ...extra,
  });
}

// ---------- Email ----------

export async function sendEmailVerification(user, { enforceLimits = true } = {}) {
  if (enforceLimits) await assertCanSend(user._id, 'email');
  const token = crypto.randomBytes(32).toString('base64url');
  await issue(user._id, 'email', sha256(token), VERIFICATION.EMAIL_TOKEN_HOURS * HOUR_MS);
  const link = `${env.CLIENT_URL.replace(/\/$/, '')}/verify-email?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Xác minh email tài khoản Tuyển dụng AI',
    text: [
      `Chào ${user.fullName},`,
      '',
      `Vui lòng mở đường dẫn sau để xác minh email của bạn (có hiệu lực trong ${VERIFICATION.EMAIL_TOKEN_HOURS} giờ):`,
      link,
      '',
      'Nếu bạn không tạo tài khoản, hãy bỏ qua thư này.',
    ].join('\n'),
  });
}

export async function verifyEmail({ token }) {
  const record = await VerificationToken.findOne({ type: 'email', tokenHash: sha256(token) });
  if (!record || record.revokedAt) {
    throw new ApiError('TOKEN_INVALID', 'Đường dẫn xác minh không hợp lệ hoặc đã được thay bằng thư mới hơn');
  }
  const user = await User.findById(record.userId);
  if (!user) throw new ApiError('TOKEN_INVALID', 'Đường dẫn xác minh không hợp lệ');
  // Bấm lại đường dẫn đã dùng (hoặc React gọi hai lần) vẫn báo thành công
  if (record.consumedAt) return { verified: true, alreadyVerified: true, email: user.email };
  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError('TOKEN_EXPIRED', 'Đường dẫn xác minh đã hết hạn, hãy gửi lại thư xác minh');
  }
  await Promise.all([
    VerificationToken.updateOne({ _id: record._id }, { consumedAt: new Date() }),
    User.updateOne({ _id: user._id }, { emailVerified: true, emailVerifiedAt: new Date() }),
  ]);
  return { verified: true, alreadyVerified: false, email: user.email };
}

export async function resendEmailVerification(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');
  if (user.emailVerified) return { message: 'Email của bạn đã được xác minh', alreadyVerified: true };
  await sendEmailVerification(user);
  return { message: 'Đã gửi lại thư xác minh, vui lòng kiểm tra hộp thư', alreadyVerified: false };
}

// ---------- OTP điện thoại ----------

// Mã 6 số chỉ có 10^6 khả năng nên không lưu SHA-256 trần: HMAC theo khóa bí mật và userId
const otpHash = (userId, code) =>
  crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${userId}:${code}`).digest('hex');

const randomCode = () => String(crypto.randomInt(0, 10 ** VERIFICATION.OTP_DIGITS)).padStart(VERIFICATION.OTP_DIGITS, '0');

export async function sendPhoneOtp(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');
  if (!user.phone) throw new ApiError('PHONE_REQUIRED', 'Bạn cần nhập số điện thoại trước khi nhận mã xác minh');
  if (user.phoneVerified) return { message: 'Số điện thoại đã được xác minh', alreadyVerified: true };

  await assertCanSend(user._id, 'phone');
  const code = randomCode();
  await issue(user._id, 'phone', otpHash(user.id, code), VERIFICATION.OTP_MINUTES * 60 * 1000, { phone: user.phone });
  await sendSms({
    to: user.phone,
    text: `Ma xac minh Tuyen dung AI cua ban la ${code}. Co hieu luc trong ${VERIFICATION.OTP_MINUTES} phut. Khong chia se ma nay.`,
  });
  return {
    message: `Đã gửi mã xác minh tới số ${user.phone}`,
    expiresInSeconds: VERIFICATION.OTP_MINUTES * 60,
    resendAfterSeconds: VERIFICATION.RESEND_COOLDOWN_SECONDS,
    alreadyVerified: false,
  };
}

export async function verifyPhoneOtp(userId, { code }) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');
  if (user.phoneVerified) return { verified: true };

  const record = await VerificationToken.findOne({ userId, type: 'phone', consumedAt: null, revokedAt: null }).sort({
    createdAt: -1,
  });
  if (!record || record.phone !== user.phone) {
    throw new ApiError('TOKEN_INVALID', 'Chưa có mã xác minh hợp lệ, hãy bấm gửi mã');
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError('TOKEN_EXPIRED', 'Mã xác minh đã hết hạn, hãy gửi mã mới');
  }

  // Tăng số lần thử trước khi so mã, nguyên tử, để các request song song không vượt quá giới hạn
  const claimed = await VerificationToken.findOneAndUpdate(
    { _id: record._id, attempts: { $lt: VERIFICATION.OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true },
  );
  if (!claimed) throw new ApiError('RATE_LIMITED', 'Bạn đã nhập sai quá số lần cho phép, hãy gửi mã mới');

  const expected = Buffer.from(record.tokenHash);
  const actual = Buffer.from(otpHash(user.id, code));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    const left = VERIFICATION.OTP_MAX_ATTEMPTS - claimed.attempts;
    throw new ApiError('TOKEN_INVALID', left > 0 ? `Mã không đúng, bạn còn ${left} lần thử` : 'Mã không đúng, hãy gửi mã mới');
  }

  await Promise.all([
    VerificationToken.updateOne({ _id: record._id }, { consumedAt: new Date() }),
    User.updateOne({ _id: user._id }, { phoneVerified: true, phoneVerifiedAt: new Date() }),
  ]);
  return { verified: true };
}
