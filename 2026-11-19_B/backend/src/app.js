import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middlewares/error.js';
import { sanitizeKeys } from './middlewares/validate.js';
import adminRoutes from './modules/admin/route.js';
import alertRoutes from './modules/alerts/route.js';
import aiRoutes from './modules/ai/route.js';
import applicationRoutes from './modules/applications/route.js';
import authRoutes from './modules/auth/route.js';
import candidateRoutes from './modules/candidates/route.js';
import companyRoutes, { employerRouter as employerStatsRoutes } from './modules/companies/route.js';
import jobRoutes, { employerRouter as employerJobRoutes } from './modules/jobs/route.js';
import mediaRoutes from './modules/media/route.js';
import metaRoutes from './modules/meta/route.js';
import notificationRoutes from './modules/notifications/route.js';
import seoRoutes from './modules/seo/route.js';
import walletRoutes from './modules/wallet/route.js';
import { installBudget } from './modules/ai/budget.js';

const app = express();

installBudget(); // v1.23: cầu dao ngân sách AI
// v1.23: sau reverse proxy phải khai báo số lớp proxy tin cậy, nếu không req.ip là IP của proxy
if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL }));
app.use(express.json({ limit: '1mb' }));
// v1.23: log truy cập không ghi IP, tác nhân trình duyệt hay referrer (không lưu IP thô)
if (!env.isTest) app.use(morgan(env.isProd ? ':method :url :status :res[content-length] - :response-time ms' : 'dev'));
app.use(sanitizeKeys);

const api = express.Router();
api.use('/auth', authRoutes);
api.use(metaRoutes); // /meta/skills, /meta/enums, /health
api.use(mediaRoutes); // v1.22: /media/:kind/:filename
api.use('/candidates', candidateRoutes);
api.use('/companies', companyRoutes);
api.use('/jobs', jobRoutes);
api.use(applicationRoutes); // /jobs/:jobId/apply, /jobs/:jobId/applications, /applications/*
api.use('/employer', employerJobRoutes); // /employer/jobs
api.use('/employer', employerStatsRoutes); // /employer/stats
api.use('/notifications', notificationRoutes);
api.use('/alerts', alertRoutes);
api.use('/admin', adminRoutes);
api.use('/ai', aiRoutes);
api.use('/wallet', walletRoutes); // v1.25: ví điểm và nạp tiền

app.use('/api/v1', api);
// Bí danh cho health check ở gốc (load balancer / docker healthcheck)
app.use(metaRoutes);
app.use(seoRoutes); // v1.24: /sitemap.xml, /robots.txt

app.use(notFound);
app.use(errorHandler);

export default app;
