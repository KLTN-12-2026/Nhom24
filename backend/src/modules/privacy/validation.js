import { z } from 'zod';

const password = z.string().max(128, 'Mật khẩu tối đa 128 ký tự').optional();

export const exportBodySchema = z.object({ password });

export const deleteBodySchema = z.object({
  confirmEmail: z
    .string({ required_error: 'Vui lòng gõ lại email của bạn để xác nhận', invalid_type_error: 'Email không hợp lệ' })
    .trim()
    .toLowerCase()
    .min(1, 'Vui lòng gõ lại email của bạn để xác nhận')
    .max(254, 'Email không hợp lệ'),
  password,
});
