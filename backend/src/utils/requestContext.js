import { AsyncLocalStorage } from 'node:async_hooks';

// Ngữ cảnh theo request: cho lớp gọi LLM biết lượt gọi này của ai mà không phải truyền userId qua mọi hàm
const storage = new AsyncLocalStorage();

/** Gắn userId cho phần còn lại của chuỗi xử lý request hiện tại (gọi từ middleware auth) */
export const bindUser = (userId) => storage.enterWith({ userId: String(userId) });

/** Chạy fn với ngữ cảnh chỉ định (script, test) */
export const runWithUser = (userId, fn) => storage.run({ userId: userId ? String(userId) : null }, fn);

export const currentUserId = () => storage.getStore()?.userId ?? null;
