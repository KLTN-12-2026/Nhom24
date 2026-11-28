import { STORAGE_KEYS } from '../constants';

// Mã thiết bị ngẫu nhiên, sinh một lần rồi lưu trong trình duyệt. Gửi kèm mọi request (header X-Device-Id) để backend
// đếm giới hạn tần suất theo thiết bị. Không chứa thông tin cá nhân; người dùng xóa dữ liệu trình duyệt là có mã mới.
const randomId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

let cached = null;

export function getDeviceId() {
  if (cached) return cached;
  try {
    let id = localStorage.getItem(STORAGE_KEYS.deviceId);
    if (!id) {
      id = randomId();
      localStorage.setItem(STORAGE_KEYS.deviceId, id);
    }
    cached = id;
  } catch {
    cached = randomId(); // localStorage không dùng được: mã chỉ sống trong phiên này
  }
  return cached;
}
