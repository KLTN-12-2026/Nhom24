import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { ACCOUNT_SECURITY, PRIVACY } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { CandidateProfile } from '../../models/candidateProfile.js';
import { Company } from '../../models/company.js';
import { RefreshToken } from '../../models/refreshToken.js';
import { VerificationToken } from '../../models/verificationToken.js';
import { User } from '../../models/user.js';
import { ApiError } from '../../utils/ApiError.js';
import { isDisposableEmail } from '../../utils/email.js';
import { hashIp } from '../../utils/privacy.js';
import { comparePassword, hashPassword, sha256 } from '../../utils/hash.js';
import { verifyGoogleCredential } from '../../providers/google.js';
import { sendEmailVerification } from './verification.js';

const toUserDto = (u) => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  phone: u.phone ?? null,
  role: u.role,
  emailVerified: u.emailVerified === true,
  phoneVerified: u.phoneVerified === true,
  status: u.status,
  avatarPath: u.avatarPath ?? null,
  termsVersion: u.termsVersion ?? null, // v1.23
  termsAcceptedAt: u.termsAcceptedAt ?? null,
});

const signAccessToken = (user) =>
  jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });

// jti đảm bảo hai token cấp trong cùng một giây vẫn khác nhau
async function issueTokens(user) {
  const refreshToken = jwt.sign({}, env.JWT_REFRESH_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_REFRESH_EXPIRES,
    jwtid: uuid(),
  });
  const { exp } = jwt.decode(refreshToken);
  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(exp * 1000),
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

const revokeAllRefreshTokens = (userId) =>
  RefreshToken.updateMany({ userId, revokedAt: { $exists: false } }, { revokedAt: new Date() });

export const hasRecentLogin = (user) =>
  Boolean(user.lastLoginAt) && Date.now() - user.lastLoginAt.getTime() <= ACCOUNT_SECURITY.RECENT_LOGIN_MINUTES * 60 * 1000;

/** Ghi nhận đồng ý Điều khoản + Quyền riêng tư phiên bản hiện hành (v1.23) */
const consentFields = () => ({ termsVersion: PRIVACY.TERMS_VERSION, termsAcceptedAt: new Date() });

export async function register({ email, password, fullName, role, phone, companyName, website }) {
  // Ô ẩn chống bot bị điền: từ chối mà không nói rõ lý do
  if (website) throw new ApiError('VALIDATION_ERROR', 'Yêu cầu không hợp lệ');
  if (isDisposableEmail(email)) {
    throw new ApiError('VALIDATION_ERROR', 'Vui lòng dùng email thật, không dùng email tạm thời', [
      { field: 'email', message: 'Không chấp nhận email dùng một lần / email tạm thời' },
    ]);
  }
  if (await User.exists({ email })) {
    throw new ApiError('CONFLICT', 'Email đã được sử dụng', [
      { field: 'email', message: 'Email đã được sử dụng' },
    ]);
  }

  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    fullName,
    phone,
    role,
    ...consentFields(),
  });

  try {
    if (role === 'candidate') {
      await CandidateProfile.create({ userId: user._id });
    } else {
      await Company.create({ ownerId: user._id, name: companyName });
    }
    const tokens = await issueTokens(user);
    // Thư xác minh không được làm hỏng đăng ký: lỗi gửi chỉ log, người dùng bấm "Gửi lại" sau
    await sendEmailVerification(user, { enforceLimits: false }).catch((err) => {
      if (!env.isTest) console.error(`Không tạo được thư xác minh cho ${user.email}: ${err.message}`);
    });
    return { user: toUserDto(user), ...tokens };
  } catch (err) {
    // Không có transaction (MongoDB đơn lẻ): dọn dẹp thủ công để không để lại user mồ côi
    await Promise.allSettled([
      User.deleteOne({ _id: user._id }),
      CandidateProfile.deleteOne({ userId: user._id }),
      Company.deleteOne({ ownerId: user._id }),
      RefreshToken.deleteMany({ userId: user._id }),
      VerificationToken.deleteMany({ userId: user._id }),
    ]);
    throw err;
  }
}

const invalidCredentials = () => new ApiError('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');

// Băm giả để mọi nhánh thất bại đều tốn đúng một lần so bcrypt: thời gian phản hồi không cho biết email có tồn tại hay không
let dummyHash;
const compareOrDummy = async (password, hash) => {
  dummyHash ??= hashPassword(randomUUID());
  const ok = await comparePassword(password, hash || (await dummyHash));
  return Boolean(hash) && ok;
};

/** Cổng người dùng: tài khoản admin bị từ chối bằng đúng lỗi "sai thông tin" để không lộ email nào là admin */
export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  // v1.15: tài khoản tạo bằng Google không có mật khẩu: nói rõ để người dùng bấm đúng nút
  if (user && user.role !== 'admin' && !user.passwordHash && user.googleId) {
    throw new ApiError('UNAUTHORIZED', 'Tài khoản này đăng nhập bằng Google');
  }
  const passwordOk = await compareOrDummy(password, user?.passwordHash);
  if (!user || user.role === 'admin' || !passwordOk) throw invalidCredentials();
  if (user.status === 'locked') throw new ApiError('FORBIDDEN', 'Tài khoản đã bị khóa');

  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await issueTokens(user);
  return { user: toUserDto(user), ...tokens };
}

// Ghi nhật ký đăng nhập admin: không bao giờ ghi mật khẩu. `reason` chỉ nằm trong log nội bộ, không trả cho client.
const logAdminLogin = (outcome, { email, ip, reason }) =>
  console.info(`[admin-login] ${outcome} email=${email} ip=${hashIp(ip)}${reason ? ` reason=${reason}` : ''}`);

/** v1.18: cổng đăng nhập admin, chỉ nhận role=admin. Mọi thất bại (kể cả tài khoản khóa) cùng một lỗi. */
export async function adminLogin({ email, password }, { ip } = {}) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordOk = await compareOrDummy(password, user?.passwordHash);
  const reason = !user
    ? 'unknown_email'
    : user.role !== 'admin'
      ? 'not_admin'
      : !passwordOk
        ? 'wrong_password'
        : user.status === 'locked'
          ? 'locked'
          : null;
  if (reason) {
    logAdminLogin('failure', { email, ip, reason });
    throw invalidCredentials();
  }

  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await issueTokens(user);
  logAdminLogin('success', { email, ip });
  return { user: toUserDto(user), ...tokens };
}

/**
 * v1.15: đăng nhập / đăng ký bằng Google ID token. Trả cùng định dạng với login.
 * Admin không bao giờ được tạo hay nối qua Google; chỉ nối vào tài khoản có sẵn khi email Google đã xác minh.
 */
export async function googleLogin({ credential, role = 'candidate', acceptTerms }) {
  const g = await verifyGoogleCredential(credential);

  let user = (await User.findOne({ googleId: g.sub })) || (await User.findOne({ email: g.email }));

  if (user) {
    if (user.role === 'admin') throw new ApiError('FORBIDDEN', 'Tài khoản quản trị không đăng nhập bằng Google');
    if (user.status === 'locked') throw new ApiError('FORBIDDEN', 'Tài khoản đã bị khóa');
    if (user.googleId && user.googleId !== g.sub) {
      throw new ApiError('FORBIDDEN', 'Email này đã được nối với một tài khoản Google khác');
    }
    if (!user.googleId) {
      user.googleId = g.sub;
      if (user.emailVerified !== true) {
        // Email chưa từng được xác minh: người khác có thể đã đăng ký trước bằng email này kèm mật khẩu của họ,
        // nên xóa mật khẩu cũ để chỉ chủ hộp thư Google mới vào được
        user.passwordHash = undefined;
        user.emailVerified = true;
        user.emailVerifiedAt = new Date();
      }
    }
    user.lastLoginAt = new Date();
    await user.save();
  } else {
    // v1.23: tạo tài khoản mới bằng Google cũng phải đồng ý Điều khoản và Quyền riêng tư
    if (acceptTerms !== true) {
      throw new ApiError('CONSENT_REQUIRED', 'Bạn cần đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư để tạo tài khoản');
    }
    if (isDisposableEmail(g.email)) {
      throw new ApiError('VALIDATION_ERROR', 'Vui lòng dùng email thật, không dùng email tạm thời');
    }
    const fullName = (g.name || g.email.split('@')[0]).slice(0, 100);
    user = await User.create({
      email: g.email,
      fullName,
      role,
      googleId: g.sub,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      ...consentFields(),
    });
    try {
      if (role === 'candidate') await CandidateProfile.create({ userId: user._id });
      else await Company.create({ ownerId: user._id, name: `Công ty của ${fullName}`.slice(0, 200) });
    } catch (err) {
      await Promise.allSettled([
        User.deleteOne({ _id: user._id }),
        CandidateProfile.deleteOne({ userId: user._id }),
        Company.deleteOne({ ownerId: user._id }),
      ]);
      throw err;
    }
  }

  const tokens = await issueTokens(user);
  return { user: toUserDto(user), ...tokens };
}

export async function refresh({ refreshToken }) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw new ApiError('UNAUTHORIZED', 'Refresh token không hợp lệ hoặc đã hết hạn');
  }

  const stored = await RefreshToken.findOne({ tokenHash: sha256(refreshToken) });
  if (!stored) throw new ApiError('UNAUTHORIZED', 'Refresh token không hợp lệ hoặc đã hết hạn');

  if (stored.revokedAt) {
    // Token đã xoay vòng mà vẫn bị dùng lại: nghi bị đánh cắp, thu hồi toàn bộ phiên của user
    await RefreshToken.updateMany(
      { userId: stored.userId, revokedAt: { $exists: false } },
      { revokedAt: new Date() },
    );
    throw new ApiError('UNAUTHORIZED', 'Refresh token đã bị thu hồi, vui lòng đăng nhập lại');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');
  if (user.status === 'locked') throw new ApiError('FORBIDDEN', 'Tài khoản đã bị khóa');

  // Xoay vòng: thu hồi atomically để hai request song song không cùng đổi được một token
  const revoked = await RefreshToken.findOneAndUpdate(
    { _id: stored._id, revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );
  if (!revoked) throw new ApiError('UNAUTHORIZED', 'Refresh token đã bị thu hồi, vui lòng đăng nhập lại');

  return issueTokens(user);
}

export async function logout(userId, { refreshToken }) {
  await RefreshToken.updateOne(
    { tokenHash: sha256(refreshToken), userId, revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );
  return { message: 'Đăng xuất thành công' };
}

export async function me(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');

  const result = { user: toUserDto(user) };
  if (user.role === 'candidate') {
    const profile = await CandidateProfile.findOne({ userId: user._id }).select('_id');
    if (profile) result.profileId = profile.id;
  } else if (user.role === 'employer') {
    const company = await Company.findOne({ ownerId: user._id }).select('_id');
    if (company) result.companyId = company.id;
  }
  return result;
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');

  if (user.passwordHash) {
    if (!currentPassword) {
      throw new ApiError('VALIDATION_ERROR', 'Vui lòng nhập mật khẩu hiện tại', [
        { field: 'currentPassword', message: 'Mật khẩu hiện tại là bắt buộc' },
      ]);
    }
    if (!(await comparePassword(currentPassword, user.passwordHash))) {
      throw new ApiError('UNAUTHORIZED', 'Mật khẩu hiện tại không đúng');
    }
  } else if (!hasRecentLogin(user)) {
    // v1.16: tài khoản chỉ có Google đặt mật khẩu lần đầu không cần mật khẩu cũ, đổi lại phải vừa đăng nhập
    throw new ApiError('REAUTH_REQUIRED', 'Để đặt mật khẩu, bạn cần đăng nhập lại bằng Google rồi thử lại ngay');
  }

  const isFirstPassword = !user.passwordHash;
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  // Đổi mật khẩu thì mọi phiên cũ phải đăng nhập lại
  await revokeAllRefreshTokens(user._id);
  return { message: isFirstPassword ? 'Đặt mật khẩu thành công' : 'Đổi mật khẩu thành công' };
}

/** v1.16: thông tin trang /account: các cách đăng nhập đang có và việc đặt mật khẩu cần đăng nhập lại hay không */
export async function getAccount(userId) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');
  const hasPassword = Boolean(user.passwordHash);
  return {
    user: toUserDto(user),
    loginMethods: { password: hasPassword, google: Boolean(user.googleId) },
    // Chỉ có ý nghĩa với tài khoản chưa có mật khẩu (xem changePassword)
    recentLogin: hasRecentLogin(user),
    recentLoginMinutes: ACCOUNT_SECURITY.RECENT_LOGIN_MINUTES,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  };
}

/** v1.16: đăng xuất khỏi mọi thiết bị (access token đã cấp vẫn dùng được tới khi hết hạn) */
export async function logoutAll(userId) {
  await revokeAllRefreshTokens(userId);
  return { message: 'Đã đăng xuất khỏi mọi thiết bị' };
}

/** Đặt / đổi số điện thoại (đã chuẩn hóa ở validation). Đổi số thì phải xác minh OTP lại. */
export async function setPhone(userId, { phone }) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');
  if (user.phone !== phone) {
    user.phone = phone;
    user.phoneVerified = false;
    user.phoneVerifiedAt = undefined;
    await user.save();
  }
  return { user: toUserDto(user) };
}

/** v1.23: ghi đồng ý phiên bản điều khoản hiện hành (tài khoản cũ hoặc khi điều khoản đổi) */
export async function acceptTerms(userId) {
  const fields = consentFields();
  const user = await User.findByIdAndUpdate(userId, { $set: fields }, { new: true });
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');
  return { termsVersion: fields.termsVersion, termsAcceptedAt: fields.termsAcceptedAt };
}
