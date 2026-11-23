import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as passwordReset from './passwordReset.js';
import * as authService from './service.js';
import * as verification from './verification.js';

export const register = asyncHandler(async (req, res) =>
  sendSuccess(res, await authService.register(req.body), 201),
);

export const login = asyncHandler(async (req, res) =>
  sendSuccess(res, await authService.login(req.body)),
);

export const adminLogin = asyncHandler(async (req, res) =>
  sendSuccess(res, await authService.adminLogin(req.body, { ip: req.ip })),
);

export const google = asyncHandler(async (req, res) =>
  sendSuccess(res, await authService.googleLogin(req.body)),
);

export const refresh = asyncHandler(async (req, res) =>
  sendSuccess(res, await authService.refresh(req.body)),
);

export const logout = asyncHandler(async (req, res) =>
  sendSuccess(res, await authService.logout(req.user.id, req.body)),
);

export const me = asyncHandler(async (req, res) =>
  sendSuccess(res, await authService.me(req.user.id)),
);

export const changePassword = asyncHandler(async (req, res) =>
  sendSuccess(res, await authService.changePassword(req.user.id, req.body)),
);

// v1.16: quên mật khẩu và quản lý tài khoản
export const forgotPassword = asyncHandler(async (req, res) =>
  sendSuccess(res, await passwordReset.requestPasswordReset(req.body)),
);

export const resetPassword = asyncHandler(async (req, res) =>
  sendSuccess(res, await passwordReset.resetPassword(req.body)),
);

export const account = asyncHandler(async (req, res) => sendSuccess(res, await authService.getAccount(req.user.id)));

export const acceptTerms = asyncHandler(async (req, res) => sendSuccess(res, await authService.acceptTerms(req.user.id)));

export const logoutAll = asyncHandler(async (req, res) => sendSuccess(res, await authService.logoutAll(req.user.id)));

export const verifyEmail = asyncHandler(async (req, res) => sendSuccess(res, await verification.verifyEmail(req.body)));

export const resendVerification = asyncHandler(async (req, res) =>
  sendSuccess(res, await verification.resendEmailVerification(req.user.id)),
);

export const setPhone = asyncHandler(async (req, res) =>
  sendSuccess(res, await authService.setPhone(req.user.id, req.body)),
);

export const sendPhoneOtp = asyncHandler(async (req, res) =>
  sendSuccess(res, await verification.sendPhoneOtp(req.user.id)),
);

export const verifyPhoneOtp = asyncHandler(async (req, res) =>
  sendSuccess(res, await verification.verifyPhoneOtp(req.user.id, req.body)),
);
