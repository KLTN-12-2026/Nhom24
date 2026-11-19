import { ApiError } from '../utils/ApiError.js';

export const zodDetails = (zodError) =>
  zodError.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));

/**
 * validate({ body, query, params }) với mỗi giá trị là một zod schema.
 * Dữ liệu đã parse (đã trim/ép kiểu) ghi đè lại req.body / req.query / req.params.
 */
export const validate = (schemas) => (req, res, next) => {
  const details = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (result.success) {
      req[part] = result.data;
    } else {
      details.push(...zodDetails(result.error));
    }
  }
  if (details.length) {
    return next(new ApiError('VALIDATION_ERROR', details[0].message, details));
  }
  next();
};

const isDangerousKey = (key) => key.startsWith('$') || key.includes('.');

const strip = (value) => {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (!isDangerousKey(key)) out[key] = strip(val);
    }
    return out;
  }
  return value;
};

/** Loại các key bắt đầu bằng `$` hoặc chứa `.` khỏi body/query/params (chống NoSQL injection) */
export const sanitizeKeys = (req, res, next) => {
  for (const part of ['body', 'query', 'params']) {
    if (req[part] && typeof req[part] === 'object') req[part] = strip(req[part]);
  }
  next();
};
