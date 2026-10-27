import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

/** Ba loại ảnh công khai. `fit` quyết định cách đổi cỡ, `kind` cũng là tên thư mục trong UPLOAD_DIR. */
export const IMAGE_KINDS = {
  logos: { width: 512, height: 512, fit: 'inside', minSide: 64 },
  covers: { width: 1500, height: 500, fit: 'cover', minWidth: 600, minSide: 64 },
  avatars: { width: 512, height: 512, fit: 'cover', minSide: 64 },
};
export const IMAGE_QUALITY = 85;
const MAX_INPUT_PIXELS = 24_000_000;

const UNSUPPORTED = 'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP';
// Tên file được phép phục vụ: uuid + đuôi ảnh (logo cũ trước v1.22 có thể là .png|.jpg)
export const IMAGE_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpe?g)$/;
export const IMAGE_CONTENT_TYPE = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

/** Nhận dạng theo byte đầu file, không dựa vào đuôi hay mimetype của client. Trả 'jpeg' | 'png' | 'webp' | null. */
export function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

const invalid = (message) => new ApiError('VALIDATION_ERROR', message, [{ field: 'file', message }]);

/**
 * Kiểm tra, xoay theo EXIF, đổi cỡ và mã hóa lại thành WEBP. sharp không giữ metadata nếu không yêu cầu,
 * nên EXIF/GPS và mọi dữ liệu nhúng đều bị loại. Ném ApiError (tiếng Việt) khi ảnh không hợp lệ.
 */
export async function processImage(buffer, kind) {
  const spec = IMAGE_KINDS[kind];
  if (!spec) throw new Error(`Loại ảnh không hỗ trợ: ${kind}`);
  const type = sniffImageType(buffer);
  if (!type) throw new ApiError('UNSUPPORTED_FILE_TYPE', UNSUPPORTED);

  try {
    const base = () => sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await base().metadata();
    if (meta.format !== type) throw new ApiError('UNSUPPORTED_FILE_TYPE', UNSUPPORTED);
    const { width = 0, height = 0 } = meta;
    // metadata() chưa tính hướng xoay EXIF: hướng 5-8 hoán đổi rộng / cao
    const [w, h] = meta.orientation >= 5 ? [height, width] : [width, height];
    if (Math.min(w, h) < spec.minSide) throw invalid(`Ảnh quá nhỏ, mỗi cạnh cần ít nhất ${spec.minSide}px`);
    if (spec.minWidth && w < spec.minWidth) throw invalid(`Ảnh bìa quá hẹp, chiều rộng cần ít nhất ${spec.minWidth}px`);

    let pipeline = base().rotate();
    if (spec.fit === 'inside') {
      pipeline = pipeline.resize(spec.width, spec.height, { fit: 'inside', withoutEnlargement: true });
    } else {
      // Cắt giữa về đúng tỉ lệ khung; ảnh nhỏ hơn khung thì không phóng to
      const ratio = spec.width / spec.height;
      const targetW = Math.min(spec.width, w, Math.floor(h * ratio));
      pipeline = pipeline.resize(targetW, Math.round(targetW / ratio), { fit: 'cover', position: 'centre' });
    }
    return await pipeline.webp({ quality: IMAGE_QUALITY }).toBuffer();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (/pixel limit|too large/i.test(err.message)) throw invalid('Ảnh có độ phân giải quá lớn');
    throw invalid('Không đọc được ảnh, file có thể bị hỏng');
  }
}

const dirOf = (kind) => path.join(env.UPLOAD_DIR, kind);

/** Ghi ảnh đã xử lý với tên ngẫu nhiên; trả đường dẫn tương đối so với UPLOAD_DIR (`logos/{uuid}.webp`) */
export async function storeImage(kind, buffer) {
  const dir = dirOf(kind);
  await fs.mkdir(dir, { recursive: true });
  const name = `${uuid()}.webp`;
  await fs.writeFile(path.join(dir, name), buffer, { flag: 'wx' });
  return `${kind}/${name}`;
}

/** Đường dẫn tuyệt đối của ảnh trong thư mục `kind`, hoặc null nếu tên không đúng mẫu / thoát ra ngoài thư mục */
export function imageFilePath(kind, filename) {
  if (!IMAGE_KINDS[kind] || !IMAGE_FILE_PATTERN.test(filename)) return null;
  const file = path.resolve(dirOf(kind), filename);
  return file.startsWith(dirOf(kind) + path.sep) ? file : null;
}

/** Xóa ảnh theo đường dẫn lưu trong DB, chỉ khi nằm đúng thư mục `kind`; lỗi không ném (ảnh mồ côi chấp nhận được) */
export async function removeImage(kind, storedPath) {
  if (!storedPath) return;
  const [dir, name, ...rest] = String(storedPath).split('/');
  if (dir !== kind || rest.length) return;
  const file = imageFilePath(kind, name);
  if (file) await fs.rm(file, { force: true }).catch(() => {});
}
