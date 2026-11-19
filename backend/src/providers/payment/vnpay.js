import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPayUrl, gatewayIp, readResult, verifySignature, vnpDate } from './vnpayCore.js';

// Cổng VNPAY sandbox (CONTRACT 7.10). Khóa bí mật chỉ đọc từ env.VNPAY_HASH_SECRET, không bao giờ log hay trả ra ngoài.

const returnUrl = () => env.VNPAY_RETURN_URL || `${env.CLIENT_URL.replace(/\/$/, '')}/candidate/wallet/result`;

export const vnpayProvider = {
  name: 'vnpay',

  /** Ném NOT_IMPLEMENTED nếu chưa cấu hình mã website và khóa */
  assertReady() {
    if (!env.VNPAY_TMN_CODE || !env.VNPAY_HASH_SECRET) {
      throw new ApiError('NOT_IMPLEMENTED', 'Cổng thanh toán VNPAY chưa được cấu hình');
    }
  },

  createPayment({ order, ipAddr }) {
    this.assertReady();
    const params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: env.VNPAY_TMN_CODE,
      vnp_Amount: order.amountVnd * 100,
      vnp_CreateDate: vnpDate(order.createdAt ?? new Date()),
      vnp_CurrCode: 'VND',
      vnp_IpAddr: gatewayIp(ipAddr),
      vnp_Locale: 'vn',
      vnp_OrderInfo: `Nap diem vi ${order.id}`, // không dấu, không ký tự đặc biệt
      vnp_OrderType: 'other',
      vnp_ReturnUrl: returnUrl(),
      vnp_ExpireDate: vnpDate(order.expiresAt),
      vnp_TxnRef: order.txnRef,
    };
    return { payUrl: buildPayUrl(env.VNPAY_PAY_URL, params, env.VNPAY_HASH_SECRET) };
  },

  /** Xác minh chữ ký và mã website; trả { valid, txnRef, amountVnd, success, gatewayTxnId, responseCode } */
  verifyCallback(params) {
    if (!env.VNPAY_HASH_SECRET || !verifySignature(params, env.VNPAY_HASH_SECRET)) return { valid: false };
    if (env.VNPAY_TMN_CODE && params.vnp_TmnCode !== env.VNPAY_TMN_CODE) return { valid: false };
    return { valid: true, ...readResult(params) };
  },
};
