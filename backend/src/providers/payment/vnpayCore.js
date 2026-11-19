import crypto from 'node:crypto';

// Cách ký của VNPAY 2.1.0 (https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html):
// lấy mọi tham số vnp_* khác rỗng (trừ vnp_SecureHash, vnp_SecureHashType), sắp tên tăng dần, mã hóa tên và giá trị
// bằng encodeURIComponent (khoảng trắng thành '+'), nối key=value bằng '&', ký HMAC-SHA512 (hex) bằng chuỗi bí mật.
// Cổng mock dùng chung đoạn này với khóa của riêng nó.

const encode = (value) => encodeURIComponent(String(value)).replace(/%20/g, '+');
const IGNORED = new Set(['vnp_SecureHash', 'vnp_SecureHashType']);

/** Chuỗi dữ liệu để ký (cũng chính là query string của đường dẫn thanh toán, trừ vnp_SecureHash) */
export function signData(params, { keepEmpty = false } = {}) {
  return Object.keys(params)
    .filter((k) => k.startsWith('vnp_') && !IGNORED.has(k) && params[k] !== undefined && params[k] !== null && (keepEmpty || params[k] !== ''))
    .sort()
    .map((k) => `${encode(k)}=${encode(params[k])}`)
    .join('&');
}

export const sign = (params, secret, options) => crypto.createHmac('sha512', secret).update(Buffer.from(signData(params, options), 'utf-8')).digest('hex');

/** So sánh thời gian cố định; thiếu chữ ký hoặc sai độ dài thì sai */
export function verifySignature(params, secret) {
  const given = typeof params?.vnp_SecureHash === 'string' ? params.vnp_SecureHash.toLowerCase() : '';
  if (!secret || !/^[0-9a-f]{128}$/.test(given)) return false;
  // Các mẫu chính thức của VNPAY không thống nhất về tham số rỗng (mẫu Java bỏ, mẫu PHP / Node giữ `key=`), nên chấp nhận cả hai
  // cách tính. Cả hai đều cần khóa bí mật nên không mở thêm đường giả mạo; chỉ khác nhau khi callback có tham số rỗng.
  const givenBuf = Buffer.from(given, 'hex');
  const variants = [{ keepEmpty: false }];
  if (Object.entries(params).some(([k, v]) => k.startsWith('vnp_') && !IGNORED.has(k) && v === '')) variants.push({ keepEmpty: true });
  return variants.some((options) => crypto.timingSafeEqual(Buffer.from(sign(params, secret, options), 'hex'), givenBuf));
}

const pad = (n) => String(n).padStart(2, '0');

/** yyyyMMddHHmmss theo GMT+7 */
export function vnpDate(date) {
  const t = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
}

/** IP gửi cho cổng (giao thức bắt buộc); không lưu, không log. IPv6 loopback / ánh xạ IPv4 được đổi về IPv4 */
export function gatewayIp(ip) {
  const v = String(ip || '127.0.0.1').replace(/^::ffff:/, '');
  return v === '::1' ? '127.0.0.1' : v.slice(0, 45);
}

/** Đọc kết quả từ tham số callback đã được xác minh chữ ký */
export function readResult(params) {
  const raw = Number(params.vnp_Amount);
  const amountVnd = Number.isInteger(raw) && raw % 100 === 0 ? raw / 100 : NaN; // vnp_Amount = đồng × 100
  return {
    txnRef: typeof params.vnp_TxnRef === 'string' ? params.vnp_TxnRef : '',
    amountVnd,
    // Chặt hơn mẫu của VNPAY (chỉ một trong hai): cả mã phản hồi và trạng thái giao dịch đều phải là "00"
    success: params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00',
    gatewayTxnId: typeof params.vnp_TransactionNo === 'string' ? params.vnp_TransactionNo.slice(0, 40) : undefined,
    responseCode: typeof params.vnp_ResponseCode === 'string' ? params.vnp_ResponseCode.slice(0, 10) : undefined,
  };
}

export function buildPayUrl(baseUrl, params, secret) {
  return `${baseUrl}?${signData(params)}&vnp_SecureHash=${sign(params, secret)}`;
}
