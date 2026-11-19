import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const invalid = () => new ApiError('UNAUTHORIZED', 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn');

let client;

/**
 * Kiểm tra Google ID token và trả { sub, email, name, emailVerified }.
 * Thư viện kiểm tra chữ ký, hạn và audience; issuer, audience và email_verified được kiểm tra lại ở đây.
 * Không bao giờ log hoặc đưa credential vào thông báo lỗi.
 */
export async function verifyGoogleCredential(credential) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new ApiError('NOT_IMPLEMENTED', 'Đăng nhập bằng Google chưa được cấu hình trên máy chủ');
  }
  client ??= new OAuth2Client();

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw invalid();
  }

  const audiences = [].concat(payload?.aud ?? []);
  if (!payload?.sub || !payload.email || !ISSUERS.includes(payload.iss) || !audiences.includes(env.GOOGLE_CLIENT_ID)) {
    throw invalid();
  }
  if (payload.exp && payload.exp * 1000 < Date.now()) throw invalid();
  if (payload.email_verified !== true) {
    throw new ApiError('UNAUTHORIZED', 'Email Google chưa được xác minh nên không thể dùng để đăng nhập');
  }
  return {
    sub: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: String(payload.name || '').trim(),
    emailVerified: true,
  };
}
