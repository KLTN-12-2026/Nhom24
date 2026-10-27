import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

/** Đường dẫn lưu trong DB: tương đối so với UPLOAD_DIR, dùng dấu `/` (vd `cv/{userId}/{uuid}.pdf`) */
export const toStoredPath = (absolutePath) =>
  path.relative(env.UPLOAD_DIR, absolutePath).split(path.sep).join('/');

/**
 * storedPath có thể là đường dẫn tuyệt đối (dữ liệu cũ) hoặc tương đối so với backend / UPLOAD_DIR.
 * Chỉ trả file nằm trong UPLOAD_DIR và còn tồn tại (chống path traversal từ dữ liệu trong DB), ngược lại null.
 */
export function resolveStoredPath(storedPath) {
  if (!storedPath) return null;
  const root = env.UPLOAD_DIR + path.sep;
  const candidates = path.isAbsolute(storedPath)
    ? [storedPath]
    : [path.resolve(env.backendDir, storedPath), path.resolve(env.UPLOAD_DIR, storedPath)];
  return candidates.find((p) => path.resolve(p).startsWith(root) && fs.existsSync(p)) ?? null;
}
