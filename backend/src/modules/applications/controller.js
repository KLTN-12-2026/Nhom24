import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendList, sendSuccess } from '../../utils/response.js';
import * as interviews from './interviews.js';
import * as messages from './messages.js';
import * as service from './service.js';
import * as templates from './templates.js';

export const apply = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.apply(req.user, req.params.jobId, req.body), 201),
);

export const listMine = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listMine(req.user, req.query);
  sendList(res, items, meta);
});

export const withdraw = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.withdraw(req.user, req.params.id)),
);

export const listForJob = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listForJob(req.user, req.params.jobId, req.query);
  sendList(res, items, meta);
});

export const getDetail = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.getDetail(req.user, req.params.id)),
);

export const updateStatus = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.updateStatus(req.user, req.params.id, req.body)),
);

export const review = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.review(req.user, req.params.id, req.body)),
);

export const setInterview = asyncHandler(async (req, res) =>
  sendSuccess(res, await interviews.setInterview(req.user, req.params.id, req.body)),
);

export const respondInterview = asyncHandler(async (req, res) =>
  sendSuccess(res, await interviews.respond(req.user, req.params.id, req.body)),
);

export const upcomingInterviews = asyncHandler(async (req, res) =>
  sendSuccess(res, await interviews.upcoming(req.user, req.query)),
);

export const listMessages = asyncHandler(async (req, res) => {
  const { items, meta } = await messages.listMessages(req.user, req.params.id, req.query);
  sendList(res, items, meta);
});

export const sendMessage = asyncHandler(async (req, res) =>
  sendSuccess(res, await messages.sendMessage(req.user, req.params.id, req.body), 201),
);

export const markMessagesRead = asyncHandler(async (req, res) =>
  sendSuccess(res, await messages.markRead(req.user, req.params.id)),
);

export const messageTemplates = asyncHandler(async (req, res) =>
  sendSuccess(res, await templates.listTemplates(req.user, req.params.id)),
);

export const downloadCv = asyncHandler(async (req, res, next) => {
  const { file, downloadName } = await service.getCvFile(req.user, req.params.id);
  res.download(file, downloadName, (err) => {
    if (err && !res.headersSent) next(err);
  });
});
