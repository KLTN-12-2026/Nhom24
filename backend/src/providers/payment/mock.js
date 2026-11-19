import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { readResult, sign, verifySignature, vnpDate } from './vnpayCore.js';

// Cổng giả lập (mặc định, cho phát triển và test): cùng định dạng tham số và cách ký của VNPAY nhưng dùng khóa riêng,
// nên đi qua đúng đường xác minh như cổng thật. Bị từ chối ở production.

const MOCK_TMN = 'MOCKTMN1';
export const mockSecret = () =>
  env.PAYMENT_MOCK_SECRET || crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update('payment-mock').digest('hex');

export const mockProvider = {
  name: 'mock',

  assertReady() {
    if (env.isProd) throw new ApiError('NOT_IMPLEMENTED', 'Cổng thanh toán giả lập không dùng được ở môi trường production');
  },

  createPayment({ order }) {
    this.assertReady();
    return { payUrl: `${env.CLIENT_URL.replace(/\/$/, '')}/candidate/wallet/mock-pay?order=${order.id}` };
  },

  /** Tham số "cổng gọi về" đã ký, cho trang giả lập thanh toán thành công / thất bại */
  buildCallbackParams({ order, outcome }) {
    this.assertReady();
    const ok = outcome === 'success';
    const params = {
      vnp_TmnCode: MOCK_TMN,
      vnp_Amount: String(order.amountVnd * 100),
      vnp_BankCode: 'MOCKBANK',
      vnp_OrderInfo: `Nap diem vi ${order.id}`,
      vnp_PayDate: vnpDate(new Date()),
      vnp_ResponseCode: ok ? '00' : '24',
      vnp_TransactionNo: `MOCK${Date.now()}`,
      vnp_TransactionStatus: ok ? '00' : '02',
      vnp_TxnRef: order.txnRef,
    };
    return { ...params, vnp_SecureHash: sign(params, mockSecret()) };
  },

  verifyCallback(params) {
    if (env.isProd || !verifySignature(params, mockSecret())) return { valid: false };
    if (params.vnp_TmnCode !== MOCK_TMN) return { valid: false };
    return { valid: true, ...readResult(params) };
  },
};
