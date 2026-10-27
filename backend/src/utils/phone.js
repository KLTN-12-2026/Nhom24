import { z } from 'zod';

/**
 * Số điện thoại Việt Nam: 10 số, đầu 03/05/07/08/09. Chấp nhận +84 / 84, khoảng trắng, dấu chấm, gạch, ngoặc.
 * Trả về dạng chuẩn hóa `0xxxxxxxxx` hoặc null nếu sai.
 */
export function normalizePhone(input) {
  if (input == null) return null;
  let digits = String(input).trim().replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+84')) digits = `0${digits.slice(3)}`;
  else if (/^84\d{9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return /^0[35789]\d{8}$/.test(digits) ? digits : null;
}

/** zod: chuỗi số điện thoại Việt Nam, đầu ra đã chuẩn hóa (0xxxxxxxxx) */
export const phoneSchema = z
  .string({ invalid_type_error: 'Số điện thoại không hợp lệ' })
  .trim()
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Số điện thoại không hợp lệ (10 số, đầu 03, 05, 07, 08 hoặc 09)',
      });
      return z.NEVER;
    }
    return phone;
  });
