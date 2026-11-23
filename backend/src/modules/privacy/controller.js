import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as service from './service.js';

export const exportData = asyncHandler(async (req, res) => {
  const { filename, json } = await service.exportData(req.user, req.body);
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(json);
});

export const deleteAccount = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.deleteAccount(req.user, req.body)),
);
