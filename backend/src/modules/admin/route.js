import { Router } from 'express';
import { auth } from '../../middlewares/auth.js';
import { role } from '../../middlewares/role.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './controller.js';
import * as wallet from '../wallet/controller.js';
import {
  adjustBodySchema,
  adminOrdersQuerySchema,
  adminTransactionsQuerySchema,
  idParamsSchema as walletIdParams,
  reportQuerySchema,
} from '../wallet/validation.js';
import {
  aiSettingsBodySchema,
  aiStatsQuerySchema,
  companiesQuerySchema,
  idParamsSchema,
  jobsQuerySchema,
  moderationSettingsBodySchema,
  reportsQuerySchema,
  resolveReportBodySchema,
  reviewBodySchema,
  reviewCompanyBodySchema,
  revokeVerificationBodySchema,
  takedownBodySchema,
  trustBodySchema,
  userStatusBodySchema,
  usersQuerySchema,
} from './validation.js';

const router = Router();

router.use(auth, role('admin'));

router.get('/users', validate({ query: usersQuerySchema }), controller.listUsers);
router.patch(
  '/users/:id/status',
  validate({ params: idParamsSchema, body: userStatusBodySchema }),
  controller.setUserStatus,
);
router.get('/jobs', validate({ query: jobsQuerySchema }), controller.listJobs);
router.patch(
  '/jobs/:id/review',
  validate({ params: idParamsSchema, body: reviewBodySchema }),
  controller.reviewJob,
);
router.get('/jobs/:id/events', validate({ params: idParamsSchema }), controller.jobEvents);
router.post(
  '/jobs/:id/takedown',
  validate({ params: idParamsSchema, body: takedownBodySchema }),
  controller.takedownJob,
);
router.get('/stats', controller.stats);

// v1.27: tự đăng tin cho công ty đã xác minh: công tắc, ngưỡng, cờ công ty
router.get('/moderation/settings', controller.moderationSettings);
router.patch('/moderation/settings', validate({ body: moderationSettingsBodySchema }), controller.updateModerationSettings);
router.patch(
  '/companies/:id/trust',
  validate({ params: idParamsSchema, body: trustBodySchema }),
  controller.setCompanyTrust,
);
router.post(
  '/companies/:id/revoke-verification',
  validate({ params: idParamsSchema, body: revokeVerificationBodySchema }),
  controller.revokeVerification,
);

// v1.23: theo dõi chi phí AI, công tắc tạm tắt công cụ AI
router.get('/ai/stats', validate({ query: aiStatsQuerySchema }), controller.aiStats);
router.get('/ai/settings', controller.aiSettings);
router.patch('/ai/settings', validate({ body: aiSettingsBodySchema }), controller.updateAiSettings);

// v1.25: ví điểm, đơn nạp, điều chỉnh điểm, báo cáo doanh thu
router.get('/wallet/orders', validate({ query: adminOrdersQuerySchema }), wallet.adminOrders);
router.get('/wallet/transactions', validate({ query: adminTransactionsQuerySchema }), wallet.adminTransactions);
router.get('/wallet/users/:id', validate({ params: walletIdParams }), wallet.adminUserWallet);
router.post('/wallet/adjust', validate({ body: adjustBodySchema }), wallet.adminAdjust);
router.get('/wallet/report', validate({ query: reportQuerySchema }), wallet.adminReport);

// v1.14: duyệt công ty và xử lý báo cáo tin
router.get('/companies', validate({ query: companiesQuerySchema }), controller.listCompanies);
router.get('/companies/:id/license', validate({ params: idParamsSchema }), controller.downloadLicense);
router.patch(
  '/companies/:id/review',
  validate({ params: idParamsSchema, body: reviewCompanyBodySchema }),
  controller.reviewCompany,
);
// v1.20: đọc tin nhắn của đơn khi tin có báo cáo đang chờ xử lý
router.get('/applications/:id/messages', validate({ params: idParamsSchema }), controller.applicationMessages);
router.get('/reports', validate({ query: reportsQuerySchema }), controller.listReports);
router.patch(
  '/reports/:id/resolve',
  validate({ params: idParamsSchema, body: resolveReportBodySchema }),
  controller.resolveReport,
);

export default router;
