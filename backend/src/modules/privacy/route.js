import { Router } from 'express';
import { auth } from '../../middlewares/auth.js';
import { deleteAccountLimiter, exportLimiter } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './controller.js';
import { deleteBodySchema, exportBodySchema } from './validation.js';

// Gắn vào /auth/account (xuất dữ liệu, xóa tài khoản). Mọi route cần đăng nhập và xác thực lại bằng mật khẩu
const router = Router();

router.post('/export', auth, exportLimiter, validate({ body: exportBodySchema }), controller.exportData);
router.post('/delete', auth, deleteAccountLimiter, validate({ body: deleteBodySchema }), controller.deleteAccount);

export default router;
