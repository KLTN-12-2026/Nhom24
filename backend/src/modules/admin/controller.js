import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendList, sendSuccess } from '../../utils/response.js';
import * as service from './service.js';
import * as moderation from './moderation.js';
import * as trust from './trust.js';
import { adminThread } from '../applications/messages.js';
import * as aiBudget from '../ai/budget.js';

export const listUsers = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listUsers(req.query);
  sendList(res, items, meta);
});

export const setUserStatus = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.setUserStatus(req.user, req.params.id, req.body.status)),
);

export const listJobs = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listJobs(req.query);
  sendList(res, items, meta);
});

export const reviewJob = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.reviewJob(req.user, req.params.id, req.body)),
);

export const stats = asyncHandler(async (req, res) => sendSuccess(res, await service.stats()));

export const listCompanies = asyncHandler(async (req, res) => {
  const { items, meta } = await moderation.listCompanies(req.query);
  sendList(res, items, meta);
});

export const reviewCompany = asyncHandler(async (req, res) =>
  sendSuccess(res, await moderation.reviewCompany(req.user, req.params.id, req.body)),
);

export const downloadLicense = asyncHandler(async (req, res, next) => {
  const { file, downloadName } = await moderation.getLicense(req.params.id);
  res.set('Cache-Control', 'no-store');
  res.download(file, downloadName, (err) => {
    if (err && !res.headersSent) next(err);
  });
});

export const applicationMessages = asyncHandler(async (req, res) =>
  sendSuccess(res, await adminThread(req.params.id)),
);

export const listReports = asyncHandler(async (req, res) => {
  const { items, meta } = await moderation.listReports(req.query);
  sendList(res, items, meta);
});

export const resolveReport = asyncHandler(async (req, res) =>
  sendSuccess(res, await moderation.resolveReport(req.user, req.params.id, req.body)),
);

// v1.23: theo dõi AI
export const aiStats = asyncHandler(async (req, res) => sendSuccess(res, await aiBudget.getStats(req.query.days)));

export const aiSettings = asyncHandler(async (req, res) => sendSuccess(res, await aiBudget.getSettings()));

export const updateAiSettings = asyncHandler(async (req, res) =>
  sendSuccess(res, await aiBudget.setEnabled(req.user.id, req.body.enabled)),
);

// v1.27: kiểm duyệt tin, cờ công ty, cài đặt tự đăng
export const jobEvents = asyncHandler(async (req, res) => sendSuccess(res, await trust.listJobEvents(req.params.id)));

export const takedownJob = asyncHandler(async (req, res) =>
  sendSuccess(res, await trust.takedownJob(req.user, req.params.id, req.body)),
);

export const setCompanyTrust = asyncHandler(async (req, res) =>
  sendSuccess(res, await trust.setCompanyTrust(req.user, req.params.id, req.body)),
);

export const revokeVerification = asyncHandler(async (req, res) =>
  sendSuccess(res, await trust.revokeVerification(req.user, req.params.id, req.body)),
);

export const moderationSettings = asyncHandler(async (req, res) => sendSuccess(res, await trust.getSettings()));

export const updateModerationSettings = asyncHandler(async (req, res) =>
  sendSuccess(res, await trust.updateSettings(req.user, req.body)),
);
