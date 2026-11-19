import { env } from '../../config/env.js';
import { createOutbox } from '../outbox.js';

/**
 * Lớp gửi SMS. Một provider là `{ send({ to, text }) }`. Chọn bằng SMS_PROVIDER:
 *  - `mock` (mặc định): ghi tin ra log máy chủ (production chỉ ghi số đã che, không ghi mã) và giữ trong `smsOutbox` khi test.
 *  - tên khác: đăng ký bằng registerSmsProvider('esms', { send }) khi khởi động rồi đặt SMS_PROVIDER=esms.
 */
export const smsOutbox = createOutbox();

const maskPhone = (phone) => String(phone).replace(/^(\d{3})\d+(\d{2})$/, '$1*****$2');

const mockProvider = {
  async send({ to, text }) {
    if (env.isTest) smsOutbox.push({ to, text });
    if (env.isProd) console.log(`[sms] gửi tới ${maskPhone(to)}`);
    else if (!env.isTest) console.log(`[sms] tới: ${to}\n[sms] nội dung: ${text}`);
  },
};

const providers = { mock: mockProvider };

export const registerSmsProvider = (name, provider) => {
  providers[name] = provider;
};

export async function sendSms(message) {
  const provider = providers[env.SMS_PROVIDER] ?? mockProvider;
  try {
    await provider.send(message);
    return true;
  } catch (err) {
    if (!env.isTest) console.error(`[sms] không gửi được tin tới ${maskPhone(message.to)}: ${err.message}`);
    return false;
  }
}
