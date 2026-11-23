import { z } from 'zod';
import {
  AI_LIMITS,
  AUTO_FLAG,
  COMPANY_VERIFICATION_STATUS,
  JOB_STATUS,
  PENDING_REASON,
  PUBLISH_SOURCE,
  REPORT_STATUS,
  ROLES,
  USER_STATUS,
} from '../../config/constants.js';
import { emptyToUndefined, objectIdSchema, paginationFields } from '../../utils/queryHelpers.js';

export const idParamsSchema = z.object({ id: objectIdSchema });

export const usersQuerySchema = z.object({
  role: emptyToUndefined(z.enum(ROLES, { errorMap: () => ({ message: 'Vai trò không hợp lệ' }) }).optional()),
  status: emptyToUndefined(
    z.enum(USER_STATUS, { errorMap: () => ({ message: 'Trạng thái tài khoản không hợp lệ' }) }).optional(),
  ),
  q: z.string().trim().max(100, 'Từ khóa tối đa 100 ký tự').optional(),
  ...paginationFields,
});

export const userStatusBodySchema = z.object({
  status: z.enum(USER_STATUS, { errorMap: () => ({ message: 'Trạng thái phải là active hoặc locked' }) }),
});

export const jobsQuerySchema = z.object({
  status: emptyToUndefined(
    z.enum(JOB_STATUS, { errorMap: () => ({ message: 'Trạng thái tin không hợp lệ' }) }).default('pending'),
  ),
  // v1.27
  reason: emptyToUndefined(z.enum(PENDING_REASON, { errorMap: () => ({ message: 'Lý do chờ duyệt không hợp lệ' }) }).optional()),
  flag: emptyToUndefined(z.enum(AUTO_FLAG, { errorMap: () => ({ message: 'Dấu hiệu không hợp lệ' }) }).optional()),
  source: emptyToUndefined(z.enum(PUBLISH_SOURCE, { errorMap: () => ({ message: 'Nguồn đăng không hợp lệ' }) }).optional()),
  ...paginationFields,
});

export const reviewBodySchema = z.object({
  decision: z.enum(['approve', 'reject'], { errorMap: () => ({ message: 'decision phải là approve hoặc reject' }) }),
  reviewNote: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự').optional(),
});

export const companiesQuerySchema = z.object({
  status: emptyToUndefined(
    z
      .enum([...COMPANY_VERIFICATION_STATUS, 'all'], { errorMap: () => ({ message: 'Trạng thái xác minh không hợp lệ' }) })
      .default('pending'),
  ),
  q: z.string().trim().max(100, 'Từ khóa tối đa 100 ký tự').optional(),
  ...paginationFields,
});

export const reviewCompanyBodySchema = z.object({
  decision: z.enum(['approve', 'reject'], { errorMap: () => ({ message: 'decision phải là approve hoặc reject' }) }),
  reason: z.string().trim().max(1000, 'Lý do tối đa 1000 ký tự').optional(),
});

export const reportsQuerySchema = z.object({
  status: emptyToUndefined(
    z.enum([...REPORT_STATUS, 'all'], { errorMap: () => ({ message: 'Trạng thái báo cáo không hợp lệ' }) }).default('open'),
  ),
  ...paginationFields,
});

export const resolveReportBodySchema = z.object({
  action: z.enum(['dismiss', 'remove'], { errorMap: () => ({ message: 'action phải là dismiss hoặc remove' }) }),
  note: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự').optional(),
  lockAccount: z.boolean().optional(),
});

// v1.23: trang "Theo dõi AI"
export const aiStatsQuerySchema = z.object({
  days: z.coerce
    .number({ invalid_type_error: 'Số ngày không hợp lệ' })
    .int('Số ngày không hợp lệ')
    .min(1, 'Số ngày tối thiểu là 1')
    .max(AI_LIMITS.STATS_MAX_DAYS, `Số ngày tối đa là ${AI_LIMITS.STATS_MAX_DAYS}`)
    .default(AI_LIMITS.STATS_DEFAULT_DAYS),
});

export const aiSettingsBodySchema = z.object({
  enabled: z.boolean({ required_error: 'enabled là bắt buộc', invalid_type_error: 'enabled phải là true hoặc false' }),
});

// v1.27: kiểm duyệt tin và cài đặt tự đăng
export const takedownBodySchema = z.object({
  note: z.string({ required_error: 'Ghi chú là bắt buộc' }).trim().min(1, 'Ghi chú là bắt buộc khi gỡ tin').max(1000, 'Ghi chú tối đa 1000 ký tự'),
  flagCompany: z.boolean().optional(),
});

export const trustBodySchema = z.object({
  alwaysManualReview: z.boolean({ required_error: 'alwaysManualReview là bắt buộc', invalid_type_error: 'alwaysManualReview phải là true hoặc false' }),
  note: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự').optional(),
});

export const revokeVerificationBodySchema = z.object({
  reason: z.string({ required_error: 'Lý do là bắt buộc' }).trim().min(1, 'Lý do là bắt buộc').max(1000, 'Lý do tối đa 1000 ký tự'),
});

const int = (label, min, max) =>
  z.number({ invalid_type_error: `${label} phải là số` }).int(`${label} phải là số nguyên`).min(min, `${label} tối thiểu là ${min}`).max(max, `${label} tối đa là ${max}`);

export const moderationSettingsBodySchema = z
  .object({
    enabled: z.boolean({ invalid_type_error: 'enabled phải là true hoặc false' }).optional(),
    maxViolations: int('Số vi phạm tối đa', 0, 20).optional(),
    violationDays: int('Số ngày tính vi phạm', 1, 365).optional(),
    reportThreshold: int('Số người báo cáo', 1, 50).optional(),
    similarity: z.number({ invalid_type_error: 'Độ giống phải là số' }).min(0.5, 'Độ giống tối thiểu là 0.5').max(1, 'Độ giống tối đa là 1').optional(),
    reset: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Cần ít nhất một cài đặt' });
