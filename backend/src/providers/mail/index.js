import { env } from '../../config/env.js';
import { createOutbox } from '../outbox.js';

/**
 * Lớp gửi thư. Một provider là `{ send({ to, subject, text }) }`. Chọn bằng MAIL_PROVIDER:
 *  - `log` (mặc định): ghi thư ra log máy chủ. Production chỉ ghi người nhận và tiêu đề, không ghi nội dung
 *    (nội dung chứa token xác minh).
 *  - `smtp`: gửi thật qua nodemailer, cấu hình bằng SMTP_*.
 *  - `memory`: giữ thư trong `mailOutbox` (test).
 * Dùng registerMailProvider(name, provider) để thêm nhà cung cấp khác (SendGrid, SES...).
 */
export const mailOutbox = createOutbox();

const logProvider = {
  async send({ to, subject, text }) {
    if (env.isProd) {
      console.log(`[mail] gửi tới ${to}: ${subject}`);
    } else {
      console.log(`[mail] tới: ${to}\n[mail] tiêu đề: ${subject}\n${text}\n[mail] ---`);
    }
  },
};

const memoryProvider = {
  async send(message) {
    mailOutbox.push(message);
  },
};

let transporter;
const smtpProvider = {
  async send({ to, subject, text }) {
    if (!env.SMTP_HOST) throw new Error('Thiếu SMTP_HOST cho MAIL_PROVIDER=smtp');
    if (!transporter) {
      const { default: nodemailer } = await import('nodemailer');
      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        // mật khẩu ứng dụng Gmail hiển thị theo nhóm 4 ký tự cách nhau bởi dấu cách
        ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s+/g, '') } }),
      });
    }
    await transporter.sendMail({ from: env.MAIL_FROM, to, subject, text });
  },
};

const providers = { log: logProvider, smtp: smtpProvider, memory: memoryProvider };

export const registerMailProvider = (name, provider) => {
  providers[name] = provider;
};

/** Che mật khẩu SMTP (kể cả dạng bỏ dấu cách) nếu thông báo lỗi của thư viện có chứa */
function redact(text = '') {
  let out = String(text);
  const pass = env.SMTP_PASS;
  if (pass) {
    for (const secret of new Set([pass, pass.replace(/\s+/g, '')])) out = out.split(secret).join('***');
  }
  return out;
}

/** Gửi thư; lỗi của provider không được làm hỏng thao tác chính nên chỉ log rồi trả false */
export async function sendMail(message) {
  const provider = providers[env.MAIL_PROVIDER] ?? logProvider;
  try {
    await provider.send(message);
    return true;
  } catch (err) {
    if (!env.isTest) console.error(`[mail] không gửi được thư tới ${message.to}: ${redact(err.message)}`);
    return false;
  }
}
