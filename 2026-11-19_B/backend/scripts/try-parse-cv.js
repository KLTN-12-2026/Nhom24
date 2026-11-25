/**
 * Chạy thử phân tích CV độc lập (không cần MongoDB, không cần server):
 *   node scripts/try-parse-cv.js <đường dẫn file .pdf|.docx>
 * In CVParsed (JSON) ra stdout. Dùng provider trong .env; đặt LLM_PROVIDER=mock để chạy không tốn API.
 * Không in nội dung CV; lỗi in ra stderr kèm mã lỗi.
 */
import path from 'node:path';
import { parseCv } from '../src/ai/index.js';

const MIME = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const file = process.argv[2];
if (!file) {
  console.error('Cách dùng: node scripts/try-parse-cv.js <đường dẫn file .pdf|.docx>');
  process.exit(1);
}

const filePath = path.resolve(file);
const started = Date.now();
try {
  const { parsed, text, textHash } = await parseCv({
    filePath,
    mimeType: MIME[path.extname(filePath).toLowerCase()],
  });
  console.log(JSON.stringify(parsed, null, 2));
  console.error(`OK: ${text.length} ký tự, hash ${textHash.slice(0, 12)}, ${Date.now() - started}ms`);
} catch (err) {
  console.error(`Lỗi ${err.code ?? 'UNKNOWN'}: ${err.message}`);
  process.exit(2);
}
