import { ApiError } from '../utils/ApiError.js';

/** Dùng sau `auth`: role('employer', 'admin') */
export const role =
  (...allowed) =>
  (req, res, next) => {
    if (!req.user) return next(new ApiError('UNAUTHORIZED', 'Thiếu token xác thực'));
    if (!allowed.includes(req.user.role)) {
      return next(new ApiError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này'));
    }
    next();
  };
