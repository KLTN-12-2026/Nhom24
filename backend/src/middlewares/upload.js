import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { processImage } from '../utils/images.js';

const CV_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};
const LICENSE_TYPES = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};

// Kiểm tra cả mimetype lẫn đuôi file (mục 9)
const makeFilter = (allowed, message) => (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed[file.mimetype]?.includes(ext)) return cb(null, true);
  cb(new ApiError('UNSUPPORTED_FILE_TYPE', message));
};

// Lưu ngoài thư mục tĩnh, tên file là uuid
const makeStorage = (subDir) =>
  multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(env.UPLOAD_DIR, ...subDir(req));
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname).toLowerCase()}`),
  });

/** CV: field `cv`, lưu tại uploads/cv/{userId}/{uuid}.pdf|docx. Đặt sau `auth`. */
export const uploadCv = multer({
  storage: makeStorage((req) => ['cv', req.user.id]),
  limits: { fileSize: env.MAX_CV_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: makeFilter(CV_TYPES, 'Chỉ chấp nhận file PDF hoặc DOCX'),
}).single('cv');

/**
 * Ảnh công khai (v1.22, mục 8.14): đọc vào bộ nhớ (không ghi file chưa kiểm tra xuống đĩa), không tin đuôi file hay mimetype.
 * `processImageUpload` sau đó kiểm tra magic bytes, xử lý bằng sharp và gắn kết quả vào `req.image = { buffer }`.
 */
const uploadImage = (field) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_LOGO_SIZE_MB * 1024 * 1024, files: 1 },
  }).single(field);

export const uploadLogo = uploadImage('logo');
export const uploadCover = uploadImage('cover');
export const uploadAvatar = uploadImage('avatar');

export const processImageUpload = (kind, field) => async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError('VALIDATION_ERROR', 'Vui lòng chọn một ảnh', [{ field, message: 'Vui lòng chọn một ảnh' }]);
    }
    req.image = { buffer: await processImage(req.file.buffer, kind) };
    req.file = undefined; // giải phóng bộ nhớ của file gốc
    next();
  } catch (err) {
    next(err);
  }
};

/** Giấy phép kinh doanh: field `license`, lưu ở thư mục KHÔNG công khai uploads/private/licenses/{userId}/ (chỉ admin tải được) */
export const uploadLicense = multer({
  storage: makeStorage((req) => ['private', 'licenses', req.user.id]),
  limits: { fileSize: env.MAX_LICENSE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: makeFilter(LICENSE_TYPES, 'Giấy phép chỉ chấp nhận file PDF, PNG, JPG hoặc WEBP'),
}).single('license');
