import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
// Import thẳng lib: index.js của pdf-parse 1.x chạy đoạn "debug" đọc file test khi nạp bằng ESM
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { aiError } from '../providers/http.js';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function detectKind(filePath, mimeType) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (mimeType === PDF_MIME || ext === '.pdf') return 'pdf';
  if (mimeType === DOCX_MIME || ext === '.docx') return 'docx';
  return null;
}

/** Gom khoảng trắng, bỏ ký tự điều khiển nhưng giữ xuống dòng để LLM còn thấy cấu trúc CV */
export function cleanText(raw) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Trích text từ CV PDF/DOCX.
 * File hỏng hoặc không đọc được text thì ném CV_UNREADABLE (không kèm chi tiết bên trong file).
 * Việc kiểm tra độ dài tối thiểu 100 ký tự nằm ở parseCv.
 */
export async function extractText({ filePath, mimeType }) {
  const kind = detectKind(filePath, mimeType);
  if (!kind) throw aiError('UNSUPPORTED_FILE_TYPE', 'Chỉ hỗ trợ CV định dạng PDF hoặc DOCX');

  try {
    if (kind === 'pdf') {
      const buffer = await fs.readFile(filePath);
      // Sao chép sang Uint8Array riêng: pdf.js đọc sai khi Buffer nhỏ nằm trong pool dùng chung (byteOffset != 0)
      const { text } = await pdfParse(new Uint8Array(buffer));
      return cleanText(text);
    }
    const { value } = await mammoth.extractRawText({ path: filePath });
    return cleanText(value);
  } catch {
    throw aiError('CV_UNREADABLE', 'Không đọc được nội dung CV, file có thể bị hỏng hoặc được bảo vệ bằng mật khẩu');
  }
}
