import { z } from 'zod';
import { PAGINATION } from '../config/constants.js';

export const objectIdSchema = z
  .string({ required_error: 'ID là bắt buộc', invalid_type_error: 'ID không hợp lệ' })
  .regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ');

/** Query phân trang chung (mục 5.1): limit vượt 50 thì bị cắt về 50 */
export const paginationFields = {
  page: z.coerce
    .number({ invalid_type_error: 'page không hợp lệ' })
    .int('page không hợp lệ')
    .min(1, 'page tối thiểu là 1')
    .default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number({ invalid_type_error: 'limit không hợp lệ' })
    .int('limit không hợp lệ')
    .min(1, 'limit tối thiểu là 1')
    .default(PAGINATION.DEFAULT_LIMIT)
    .transform((n) => Math.min(n, PAGINATION.MAX_LIMIT)),
};

export const skipOf = ({ page, limit }) => (page - 1) * limit;

/** Chuỗi rỗng trong query (`?city=`) coi như không lọc */
export const emptyToUndefined = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema);

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Đếm theo giá trị của một trường, các khóa không có bản ghi vẫn trả về 0 */
export async function countBy(Model, field, keys, match = {}) {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const row of rows) out[row._id] = row.count;
  return out;
}

/** Số bản ghi mới mỗi ngày (UTC) trong `days` ngày gần nhất, ngày không có thì count = 0 */
export async function dailyCounts(Model, match, days) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setTime(start.getTime() - (days - 1) * DAY_MS);

  const rows = await Model.aggregate([
    { $match: { ...match, createdAt: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
        count: { $sum: 1 },
      },
    },
  ]);
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    return { date, count: counts.get(date) ?? 0 };
  });
}
