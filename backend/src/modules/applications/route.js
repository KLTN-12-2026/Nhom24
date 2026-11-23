import { Router } from 'express';
import { auth } from '../../middlewares/auth.js';
import { messageLimiter } from '../../middlewares/rateLimit.js';
import { role } from '../../middlewares/role.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './controller.js';
import {
  applySchema,
  forJobQuerySchema,
  idParamsSchema,
  jobIdParamsSchema,
  interviewSchema,
  messageBodySchema,
  messagesQuerySchema,
  mineQuerySchema,
  respondBodySchema,
  reviewBodySchema,
  statusBodySchema,
  upcomingQuerySchema,
} from './validation.js';

// Router này gắn ở gốc /api/v1 vì có cả /jobs/:jobId/... lẫn /applications/...
const router = Router();

router.post(
  '/jobs/:jobId/apply',
  auth,
  role('candidate'),
  validate({ params: jobIdParamsSchema, body: applySchema }),
  controller.apply,
);
router.get(
  '/jobs/:jobId/applications',
  auth,
  role('employer'),
  validate({ params: jobIdParamsSchema, query: forJobQuerySchema }),
  controller.listForJob,
);

router.get(
  '/applications/me',
  auth,
  role('candidate'),
  validate({ query: mineQuerySchema }),
  controller.listMine,
);
router.get(
  '/applications/:id',
  auth,
  role('candidate', 'employer'),
  validate({ params: idParamsSchema }),
  controller.getDetail,
);
router.patch(
  '/applications/:id/withdraw',
  auth,
  role('candidate'),
  validate({ params: idParamsSchema }),
  controller.withdraw,
);
router.patch(
  '/applications/:id/status',
  auth,
  role('employer'),
  validate({ params: idParamsSchema, body: statusBodySchema }),
  controller.updateStatus,
);
// v1.20: đánh giá, lịch phỏng vấn, tin nhắn, mẫu phản hồi (mục 8.12)
router.patch(
  '/applications/:id/review',
  auth,
  role('employer'),
  validate({ params: idParamsSchema, body: reviewBodySchema }),
  controller.review,
);
router.put(
  '/applications/:id/interview',
  auth,
  role('employer'),
  validate({ params: idParamsSchema, body: interviewSchema }),
  controller.setInterview,
);
router.patch(
  '/applications/:id/interview/respond',
  auth,
  role('candidate'),
  validate({ params: idParamsSchema, body: respondBodySchema }),
  controller.respondInterview,
);
router.get(
  '/interviews/upcoming',
  auth,
  role('candidate', 'employer'),
  validate({ query: upcomingQuerySchema }),
  controller.upcomingInterviews,
);
router.get(
  '/applications/:id/messages',
  auth,
  role('candidate', 'employer'),
  validate({ params: idParamsSchema, query: messagesQuerySchema }),
  controller.listMessages,
);
router.post(
  '/applications/:id/messages',
  auth,
  role('candidate', 'employer'),
  messageLimiter,
  validate({ params: idParamsSchema, body: messageBodySchema }),
  controller.sendMessage,
);
router.patch(
  '/applications/:id/messages/read',
  auth,
  role('candidate', 'employer'),
  validate({ params: idParamsSchema }),
  controller.markMessagesRead,
);
router.get(
  '/applications/:id/message-templates',
  auth,
  role('employer'),
  validate({ params: idParamsSchema }),
  controller.messageTemplates,
);
router.get(
  '/applications/:id/cv',
  auth,
  role('candidate', 'employer'),
  validate({ params: idParamsSchema }),
  controller.downloadCv,
);

export default router;
