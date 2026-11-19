import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { mockProvider } from './mock.js';
import { vnpayProvider } from './vnpay.js';

/**
 * Lớp điều hợp thanh toán (giống providers/mail và providers/sms). Một provider là:
 *   { name, createPayment({ order, ipAddr }) -> { payUrl }, verifyCallback(params) -> { valid, txnRef, amountVnd, success, gatewayTxnId, responseCode } }
 * Chọn bằng PAYMENT_PROVIDER: `mock` (mặc định, từ chối ở production) | `vnpay` (sandbox).
 * registerPaymentProvider(name, provider) để thêm cổng khác.
 */
const providers = { mock: mockProvider, vnpay: vnpayProvider };

export const registerPaymentProvider = (name, provider) => {
  providers[name] = { name, ...provider };
};

export const findPaymentProvider = (name) => providers[name] ?? null;

/** Provider đang dùng để tạo đơn; ném NOT_IMPLEMENTED nếu chưa dùng được */
export function activePaymentProvider() {
  const provider = providers[env.PAYMENT_PROVIDER];
  if (!provider) throw new ApiError('NOT_IMPLEMENTED', 'Cổng thanh toán chưa được cấu hình');
  provider.assertReady?.();
  return provider;
}
