import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';
import { escapeRegex } from './queryHelpers.js';
import { foldText } from './text.js';

const FILE = path.resolve(env.backendDir, '../data/provinces.json');

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

/** 34 đơn vị cấp tỉnh (từ 01/07/2025) rồi tới lựa chọn "Làm việc từ xa / Toàn quốc" */
export const PROVINCES = [...data.provinces, data.remote];
export const REMOTE_NAME = data.remote.name;

// Bỏ tiền tố hành chính và dấu câu: "TP. Hồ Chí Minh" / "Thành phố Hồ Chí Minh" / "tinh Nghe An" -> "ho chi minh" ...
const keyOf = (value) =>
  foldText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(thanh pho|tinh|tp) /, '');

const byKey = new Map();
for (const p of PROVINCES) {
  for (const label of [p.name, ...p.aliases]) {
    const key = keyOf(label);
    if (key && !byKey.has(key)) byKey.set(key, p);
  }
  // "tphcm" = "tp hcm" viết liền: giữ cả dạng không tiền tố lẫn dạng gộp
  byKey.set(keyOf(p.name).replace(/ /g, ''), p);
}

export const findProvince = (value) => {
  const key = keyOf(value);
  return key ? (byKey.get(key) ?? byKey.get(key.replace(/ /g, '')) ?? null) : null;
};

/** Tên chuẩn của một tên thành phố cũ/viết tắt; không nhận ra được thì trả null */
export const normalizeCity = (value) => findProvince(value)?.name ?? null;

/** Tên chuẩn nếu nhận ra, không thì giữ nguyên (dùng cho dữ liệu cũ) */
export const canonicalOrSame = (value) => normalizeCity(value) ?? (value == null ? value : String(value).trim());

const SUGGEST = 'Vui lòng chọn một tỉnh/thành trong danh sách.';

/**
 * Dùng khi nhận city từ người dùng. Trả tên chuẩn. Không nhận ra được thì báo lỗi, trừ khi giá trị đó chính là
 * giá trị đang lưu (`current`): tin/công ty cũ có thành phố lạ vẫn sửa được các trường khác.
 */
export function assertCity(value, { current, label = 'Thành phố' } = {}) {
  const canonical = normalizeCity(value);
  if (canonical) return canonical;
  if (current != null && String(value).trim() === String(current).trim()) return String(value).trim();
  const message = `${label} không hợp lệ. ${SUGGEST}`;
  throw new ApiError('VALIDATION_ERROR', message, [{ field: 'city', message }]);
}

/**
 * Điều kiện Mongo cho bộ lọc `city`: khớp tên chuẩn và mọi tên cũ/viết tắt đã biết (không phân biệt hoa thường,
 * gõ không dấu cũng nhận ra). Giá trị lạ thì khớp chính xác như trước.
 */
export function cityMatcher(value) {
  const province = findProvince(value);
  const names = province ? [province.name, ...province.aliases] : [String(value).trim()];
  return { $in: names.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i')) };
}
