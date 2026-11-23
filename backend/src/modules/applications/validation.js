import { z } from 'zod';
import { APPLICATION_STATUS, HIRING, INTERVIEW_MODE, LIMITS } from '../../config/constants.js';
import { phoneSchema } from '../../utils/phone.js';
import { emptyToUndefined, objectIdSchema, paginationFields } from '../../utils/queryHelpers.js';

const statusEnum = z.enum(APPLICATION_STATUS, { errorMap: () => ({ message: 'Trạng thái đơn không hợp lệ' }) });

export const applySchema = z.object({
  coverLetter: z.string().trim().max(5000, 'Thư giới thiệu tối đa 5000 ký tự').optional(),
  // chỉ dùng khi tài khoản chưa có số điện thoại; có rồi thì bỏ qua
  phone: z.preprocess((v) => (v === '' || v === null ? undefined : v), phoneSchema.optional()),
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Thời điểm ISO 8601 phải ở tương lai và không quá INTERVIEW_MAX_DAYS_AHEAD ngày */
const futureDate = (label) =>
  z
    .string({ required_error: `${label} là bắt buộc`, invalid_type_error: `${label} không hợp lệ` })
    .datetime({ offset: true, message: `${label} không hợp lệ` })
    .transform((s) => new Date(s))
    .refine((d) => d.getTime() > Date.now(), `${label} phải ở tương lai`)
    .refine((d) => d.getTime() <= Date.now() + HIRING.INTERVIEW_MAX_DAYS_AHEAD * DAY_MS, `${label} quá xa (tối đa ${HIRING.INTERVIEW_MAX_DAYS_AHEAD} ngày)`);

export const interviewSchema = z
  .object({
    scheduledAt: futureDate('Thời gian phỏng vấn'),
    durationMinutes: z.coerce.number().int('Thời lượng không hợp lệ').min(15, 'Thời lượng tối thiểu 15 phút').max(480, 'Thời lượng tối đa 480 phút').optional(),
    mode: z.enum(INTERVIEW_MODE, { errorMap: () => ({ message: 'Hình thức phỏng vấn không hợp lệ' }) }),
    location: z
      .string({ required_error: 'Địa điểm hoặc đường dẫn là bắt buộc' })
      .trim()
      .min(3, 'Địa điểm hoặc đường dẫn quá ngắn')
      .max(HIRING.INTERVIEW_LOCATION_MAX, `Địa điểm tối đa ${HIRING.INTERVIEW_LOCATION_MAX} ký tự`),
    message: z.string().trim().max(HIRING.INTERVIEW_MESSAGE_MAX, `Lời nhắn tối đa ${HIRING.INTERVIEW_MESSAGE_MAX} ký tự`).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'online' && !/^https?:\/\/\S+$/i.test(v.location)) {
      ctx.addIssue({ code: 'custom', path: ['location'], message: 'Phỏng vấn online cần đường dẫn bắt đầu bằng http:// hoặc https://' });
    }
  });

export const statusBodySchema = z
  .object({
    status: statusEnum,
    employerNote: z.string().trim().max(HIRING.NOTE_MAX, `Ghi chú tối đa ${HIRING.NOTE_MAX} ký tự`).optional(),
    rejectionReason: z.string().trim().max(HIRING.REASON_MAX, `Lý do tối đa ${HIRING.REASON_MAX} ký tự`).optional(),
    interview: interviewSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.rejectionReason && v.status !== 'rejected') {
      ctx.addIssue({ code: 'custom', path: ['rejectionReason'], message: 'Lý do chỉ dùng khi từ chối hồ sơ' });
    }
    if (v.interview && v.status !== 'interview') {
      ctx.addIssue({ code: 'custom', path: ['interview'], message: 'Lịch phỏng vấn chỉ dùng khi chuyển sang bước phỏng vấn' });
    }
  });

export const reviewBodySchema = z
  .object({
    rating: z
      .union([z.number({ invalid_type_error: 'Số sao không hợp lệ' }).int('Số sao không hợp lệ').min(1, 'Số sao từ 1 đến 5').max(5, 'Số sao từ 1 đến 5'), z.null()])
      .optional(),
    note: z.string().trim().max(HIRING.NOTE_MAX, `Ghi chú tối đa ${HIRING.NOTE_MAX} ký tự`).optional(),
  })
  .refine((v) => v.rating !== undefined || v.note !== undefined, 'Cần gửi rating hoặc note');

export const respondBodySchema = z.discriminatedUnion(
  'response',
  [
    z.object({ response: z.literal('confirm') }),
    z.object({
      response: z.literal('reschedule'),
      proposedAt: futureDate('Giờ đề nghị'),
      note: z.string().trim().max(HIRING.INTERVIEW_RESPONSE_NOTE_MAX, `Ghi chú tối đa ${HIRING.INTERVIEW_RESPONSE_NOTE_MAX} ký tự`).optional(),
    }),
  ],
  { errorMap: () => ({ message: 'Phản hồi phải là confirm hoặc reschedule' }) },
);

export const messageBodySchema = z.object({
  body: z
    .string({ required_error: 'Nội dung tin nhắn là bắt buộc', invalid_type_error: 'Nội dung tin nhắn không hợp lệ' })
    .trim()
    .min(1, 'Nội dung tin nhắn là bắt buộc')
    .max(LIMITS.MESSAGE_MAX, `Tin nhắn tối đa ${LIMITS.MESSAGE_MAX} ký tự`),
});

export const messagesQuerySchema = z.object({
  limit: z.coerce
    .number({ invalid_type_error: 'limit không hợp lệ' })
    .int('limit không hợp lệ')
    .min(1, 'limit tối thiểu là 1')
    .default(HIRING.MESSAGES_PAGE)
    .transform((n) => Math.min(n, HIRING.MESSAGES_PAGE)),
  before: emptyToUndefined(objectIdSchema.optional()),
});

export const upcomingQuerySchema = z.object({
  limit: z.coerce
    .number({ invalid_type_error: 'limit không hợp lệ' })
    .int('limit không hợp lệ')
    .min(1, 'limit tối thiểu là 1')
    .default(HIRING.UPCOMING_DEFAULT)
    .transform((n) => Math.min(n, HIRING.UPCOMING_MAX)),
});

export const jobIdParamsSchema = z.object({ jobId: objectIdSchema });
export const idParamsSchema = z.object({ id: objectIdSchema });

export const mineQuerySchema = z.object({
  status: emptyToUndefined(statusEnum.optional()),
  ...paginationFields,
});

export const forJobQuerySchema = z.object({
  status: emptyToUndefined(statusEnum.optional()),
  minScore: emptyToUndefined(
    z.coerce.number({ invalid_type_error: 'minScore không hợp lệ' }).min(0).max(100).optional(),
  ),
  minRating: emptyToUndefined(
    z.coerce.number({ invalid_type_error: 'minRating không hợp lệ' }).int('minRating không hợp lệ').min(1).max(5).optional(),
  ),
  sort: emptyToUndefined(
    z.enum(['score', 'newest', 'rating'], { errorMap: () => ({ message: 'Cách sắp xếp không hợp lệ' }) }).default('score'),
  ),
  ...paginationFields,
});
