import { Router } from 'express';
import { auth } from '../../middlewares/auth.js';
import {
  adminLoginLimiter,
  forgotEmailLimiter,
  forgotIpLimiter,
  loginAccountLimiter,
  googleLimiter,
  loginLimiter,
  passwordChangeLimiter,
  registerAccountLimiter,
  registerDeviceLimiter,
  registerLimiter,
  resendAccountLimiter,
  resendIpLimiter,
  verifyLimiter,
} from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import privacyRoutes from '../privacy/route.js';
import * as controller from './controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleSchema,
  loginSchema,
  logoutSchema,
  otpCodeSchema,
  phoneBodySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './validation.js';

const router = Router();

router.post(
  '/register',
  registerLimiter,
  registerDeviceLimiter,
  validate({ body: registerSchema }),
  registerAccountLimiter,
  controller.register,
);
router.post('/login', loginLimiter, validate({ body: loginSchema }), loginAccountLimiter, controller.login);
router.post('/admin/login', adminLoginLimiter, validate({ body: loginSchema }), controller.adminLogin);
router.post('/google', googleLimiter, registerDeviceLimiter, validate({ body: googleSchema }), controller.google);
router.post('/refresh', validate({ body: refreshSchema }), controller.refresh);
router.post('/logout', auth, validate({ body: logoutSchema }), controller.logout);
router.get('/me', auth, controller.me);
router.patch(
  '/password',
  auth,
  passwordChangeLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

// v1.16: quên mật khẩu và quản lý tài khoản
router.post(
  '/forgot-password',
  forgotIpLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotEmailLimiter,
  controller.forgotPassword,
);
router.post('/reset-password', verifyLimiter, validate({ body: resetPasswordSchema }), controller.resetPassword);
// v1.23: xuất dữ liệu và xóa tài khoản (POST /auth/account/export|delete); đặt trước GET /account cho rõ, không trùng phương thức
router.use('/account', privacyRoutes);
router.get('/account', auth, controller.account);
router.post('/accept-terms', auth, controller.acceptTerms);
router.post('/logout-all', auth, controller.logoutAll);

// v1.14: xác minh email và số điện thoại
router.post('/verify-email', verifyLimiter, validate({ body: verifyEmailSchema }), controller.verifyEmail);
router.post('/resend-verification', auth, resendIpLimiter, resendAccountLimiter, controller.resendVerification);
router.put('/phone', auth, validate({ body: phoneBodySchema }), controller.setPhone);
router.post('/phone/send-otp', auth, resendIpLimiter, resendAccountLimiter, controller.sendPhoneOtp);
router.post('/phone/verify-otp', auth, verifyLimiter, validate({ body: otpCodeSchema }), controller.verifyPhoneOtp);

export default router;
