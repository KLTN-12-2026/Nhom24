import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/user.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { bindUser } from '../utils/requestContext.js';

const extractToken = (req) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
};

async function resolveUser(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Phiên đăng nhập đã hết hạn'
        : 'Token không hợp lệ';
    throw new ApiError('UNAUTHORIZED', message);
  }
  // Tra DB để khóa tài khoản có hiệu lực ngay, không phải chờ token hết hạn
  const user = await User.findById(payload.sub).select('email fullName role status phone emailVerified phoneVerified');
  if (!user) throw new ApiError('UNAUTHORIZED', 'Tài khoản không tồn tại');
  if (user.status === 'locked') throw new ApiError('FORBIDDEN', 'Tài khoản đã bị khóa');
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    phone: user.phone ?? null,
    emailVerified: user.emailVerified === true,
    phoneVerified: user.phoneVerified === true,
  };
}

/** Bắt buộc đăng nhập: gắn req.user = { id, email, fullName, role } */
export const auth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw new ApiError('UNAUTHORIZED', 'Thiếu token xác thực');
  req.user = await resolveUser(token);
  bindUser(req.user.id); // v1.23: lớp gọi LLM biết lượt gọi của ai (CONTRACT 7.9)
  next();
});

/** Không bắt buộc: có token hợp lệ thì gắn req.user, ngược lại bỏ qua (dùng cho route public) */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
      bindUser(req.user.id);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
  }
  next();
});
