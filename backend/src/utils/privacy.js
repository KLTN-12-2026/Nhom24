import crypto from 'node:crypto';
import { env } from '../config/env.js';

// IP và mã thiết bị không bao giờ được lưu hay log ở dạng thô: chỉ dùng bản băm HMAC rút gọn

const HASH_LENGTH = 24;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const hmac = (scope, value) =>
  crypto
    .createHmac('sha256', env.PRIVACY_HASH_SECRET || env.JWT_ACCESS_SECRET)
    .update(`${scope}:${value}`)
    .digest('hex')
    .slice(0, HASH_LENGTH);

/** Băm IP; IP không xác định cũng ra một giá trị cố định để bộ đếm vẫn chạy */
export const hashIp = (ip) => hmac('ip', ip || 'unknown');

/** Mã thiết bị hợp lệ (header X-Device-Id) hoặc null */
export function deviceIdOf(req) {
  const raw = req.get?.('x-device-id') ?? req.headers?.['x-device-id'];
  return typeof raw === 'string' && DEVICE_ID_PATTERN.test(raw) ? raw : null;
}

/** Băm mã thiết bị, null nếu không có mã hợp lệ */
export const hashDevice = (req) => {
  const id = deviceIdOf(req);
  return id ? hmac('device', id) : null;
};
