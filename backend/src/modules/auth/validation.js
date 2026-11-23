import { z } from 'zod';
import { phoneSchema } from '../../utils/phone.js';

const required = (label) => ({ required_error: `${label} là bắt buộc`, invalid_type_error: `${label} không hợp lệ` });

const email = z
  .string(required('Email'))
  .trim()
  .toLowerCase()
  .email('Email không hợp lệ');

// Tối thiểu 8 ký tự, có chữ và số (mục 5.2)
const password = z
  .string(required('Mật khẩu'))
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(128, 'Mật khẩu tối đa 128 ký tự')
  .regex(/[A-Za-z]/, 'Mật khẩu phải có ít nhất một chữ cái')
  .regex(/\d/, 'Mật khẩu phải có ít nhất một chữ số');

const refreshToken = z.string(required('refreshToken')).min(1, 'refreshToken là bắt buộc');

export const registerSchema = z
  .object({
    email,
    password,
    fullName: z.string(required('Họ tên')).trim().min(1, 'Họ tên là bắt buộc').max(100, 'Họ tên tối đa 100 ký tự'),
    role: z.enum(['candidate', 'employer'], {
      errorMap: () => ({ message: 'Vai trò phải là candidate hoặc employer' }),
    }),
    // Chuỗi rỗng coi như không nhập (ứng viên không bắt buộc)
    phone: z.preprocess((v) => (v === '' || v === null ? undefined : v), phoneSchema.optional()),
    companyName: z.string().trim().min(1, 'Tên công ty là bắt buộc').max(200).optional(),
    // Ô ẩn chống bot: người thật không thấy nên không điền
    website: z.string().max(500).optional(),
    // v1.23: bắt buộc đồng ý Điều khoản và Quyền riêng tư
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'Bạn cần đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư để đăng ký' }),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'employer' && !data.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['companyName'],
        message: 'Nhà tuyển dụng bắt buộc nhập tên công ty',
      });
    }
    if (data.role === 'employer' && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'Nhà tuyển dụng bắt buộc nhập số điện thoại',
      });
    }
  });

export const loginSchema = z.object({
  email,
  password: z.string(required('Mật khẩu')).min(1, 'Mật khẩu là bắt buộc'),
});

export const googleSchema = z.object({
  credential: z.string(required('credential')).min(20, 'credential không hợp lệ').max(4096, 'credential không hợp lệ'),
  role: z.enum(['candidate', 'employer'], {
    errorMap: () => ({ message: 'Vai trò phải là candidate hoặc employer' }),
  }).default('candidate'),
  acceptTerms: z.boolean().optional(), // v1.23: bắt buộc true khi tạo tài khoản mới (service kiểm tra)
});

export const refreshSchema = z.object({ refreshToken });
export const logoutSchema = z.object({ refreshToken });

// v1.16: currentPassword không bắt buộc ở schema vì tài khoản chỉ có Google đặt mật khẩu lần đầu không có mật khẩu cũ;
// service bắt buộc nó với tài khoản đã có mật khẩu
export const changePasswordSchema = z
  .object({
    currentPassword: z.string(required('Mật khẩu hiện tại')).optional(),
    newPassword: password,
  })
  .refine((d) => !d.currentPassword || d.currentPassword !== d.newPassword, {
    path: ['newPassword'],
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z
    .string(required('Mã đặt lại'))
    .trim()
    .min(10, 'Đường dẫn đặt lại mật khẩu không hợp lệ')
    .max(200, 'Đường dẫn đặt lại mật khẩu không hợp lệ'),
  password,
});

export const verifyEmailSchema = z.object({
  token: z.string(required('Mã xác minh')).trim().min(10, 'Mã xác minh không hợp lệ').max(200, 'Mã xác minh không hợp lệ'),
});

export const phoneBodySchema = z.object({ phone: phoneSchema });

export const otpCodeSchema = z.object({
  code: z.string(required('Mã xác minh')).trim().regex(/^\d{6}$/, 'Mã xác minh gồm 6 chữ số'),
});
