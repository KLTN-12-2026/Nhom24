import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { redactSecrets } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { zodDetails } from './validate.js';

export const notFound = (req, res, next) =>
  next(new ApiError('NOT_FOUND', `Không tìm thấy đường dẫn ${req.method} ${req.originalUrl}`));

function toApiError(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    const details = zodDetails(err);
    return new ApiError('VALIDATION_ERROR', details[0]?.message || 'Dữ liệu không hợp lệ', details);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ApiError('FILE_TOO_LARGE', 'File vượt quá dung lượng cho phép');
    }
    return new ApiError('VALIDATION_ERROR', 'File tải lên không hợp lệ', [
      { field: err.field || 'file', message: err.message },
    ]);
  }

  // body JSON sai cú pháp
  if (err.type === 'entity.parse.failed') {
    return new ApiError('VALIDATION_ERROR', 'Nội dung JSON không hợp lệ');
  }
  if (err.type === 'entity.too.large') {
    return new ApiError('VALIDATION_ERROR', 'Nội dung gửi lên quá lớn (tối đa 1MB)');
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new ApiError('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', details);
  }
  if (err instanceof mongoose.Error.CastError) {
    return new ApiError('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
      { field: err.path, message: `Giá trị của ${err.path} không hợp lệ` },
    ]);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'unknown';
    return new ApiError('CONFLICT', 'Dữ liệu đã tồn tại', [{ field, message: `${field} đã tồn tại` }]);
  }

  return new ApiError('INTERNAL_ERROR', 'Lỗi hệ thống, vui lòng thử lại sau');
}

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const apiError = toApiError(err);

  if (apiError.code === 'INTERNAL_ERROR' && !env.isTest) {
    console.error(redactSecrets(err?.stack || err));
  }

  const error = { code: apiError.code, message: apiError.message };
  if (apiError.details) error.details = apiError.details;
  res.status(apiError.status).json({ success: false, error });
};
