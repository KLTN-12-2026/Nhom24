// Điểm nối cho cầu dao ngân sách AI (CONTRACT 7.9). Module src/ai không import Mongoose nên phần cài đặt
// (modules/ai/budget.js) tự đăng ký vào đây khi server khởi động. Chưa đăng ký (script, seed) thì không giới hạn.
let hook = null;

/** hook = { acquire(tool) -> Promise<ticket>, settle(ticket, failureReason|null) -> Promise<void> } */
export const setBudgetHook = (next) => {
  hook = next;
};

export const getBudgetHook = () => hook;
