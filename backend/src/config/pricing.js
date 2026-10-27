import { WALLET } from './constants.js';
import { env } from './env.js';

// Bảng giá ví điểm. Đọc từ biến môi trường mỗi lần gọi (test và vận hành đổi được), không viết cứng ở nơi khác.

const DEFAULT_PACKAGES = [
  { id: 'p20', points: 20, bonusPoints: 0 },
  { id: 'p50', points: 50, bonusPoints: 5 },
  { id: 'p100', points: 100, bonusPoints: 15 },
  { id: 'p200', points: 200, bonusPoints: 40 },
];

const validPackage = (p) =>
  p && /^[a-z0-9_-]{1,30}$/i.test(String(p.id)) && Number.isInteger(p.points) && p.points > 0 && Number.isInteger(p.bonusPoints ?? 0) && (p.bonusPoints ?? 0) >= 0;

function configuredPackages() {
  if (!env.WALLET_PACKAGES) return DEFAULT_PACKAGES;
  try {
    const list = JSON.parse(env.WALLET_PACKAGES);
    if (Array.isArray(list) && list.length && list.every(validPackage)) return list;
  } catch {
    /* JSON hỏng: dùng gói mặc định */
  }
  return DEFAULT_PACKAGES;
}

export const getPackages = () =>
  configuredPackages().map((p) => ({
    id: String(p.id),
    points: p.points,
    bonusPoints: p.bonusPoints ?? 0,
    totalPoints: p.points + (p.bonusPoints ?? 0),
    amountVnd: p.points * env.WALLET_VND_PER_POINT,
  }));

export const getPackage = (id) => getPackages().find((p) => p.id === id) ?? null;

/** Giá điểm mỗi lượt của từng công cụ AI */
export const getPrices = () => ({
  cv_review: env.WALLET_PRICE_CV_REVIEW,
  cover_letter: env.WALLET_PRICE_COVER_LETTER,
  interview_set: env.WALLET_PRICE_INTERVIEW_SET,
  interview_answer: env.WALLET_PRICE_INTERVIEW_ANSWER,
});

export const priceOf = (tool) => getPrices()[tool] ?? 0;

/** Bảng giá công khai (GET /wallet/pricing) */
export const getPublicPricing = (provider) => ({
  vndPerPoint: env.WALLET_VND_PER_POINT,
  freePerDay: env.AI_TOOLS_DAILY_LIMIT,
  packages: getPackages(),
  prices: getPrices(),
  provider,
  sandbox: true,
  sandboxNotice: WALLET.SANDBOX_NOTICE,
  policy: { expires: false, refundable: false, transferable: false },
});
