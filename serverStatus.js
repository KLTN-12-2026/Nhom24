import axios from 'axios';
import { API_BASE_URL } from '../api/baseUrl';

// Tình trạng máy chủ cho trang bảo trì. Chỉ coi là "ngừng" khi chính /health không trả lời được
// (mất kết nối, hết thời gian, 502/503/504 hoặc cơ sở dữ liệu báo down): một request lẻ lỗi mạng thì chưa đủ.
let down = false;
let lastCheckedAt = null;
let probing = null;
let lastReportAt = 0;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
const setDown = (value) => {
  lastCheckedAt = Date.now();
  if (value !== down) down = value;
  emit();
};

export const subscribeServerStatus = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const isServerDown = () => down;
export const lastServerCheck = () => lastCheckedAt;

/** Gọi /health một lần (gộp các lần gọi đồng thời). Trả true nếu máy chủ và cơ sở dữ liệu đều trả lời */
export function probeServer() {
  if (!probing) {
    probing = axios
      .get(`${API_BASE_URL}/health`, { timeout: 6000 })
      .then((res) => {
        const alive = res.data?.data?.db !== 'down';
        setDown(!alive);
        return alive;
      })
      .catch((err) => {
        const status = err?.response?.status;
        const alive = Boolean(err?.response) && ![502, 503, 504].includes(status);
        setDown(!alive);
        return alive;
      })
      .finally(() => {
        probing = null;
      });
  }
  return probing;
}

/** Interceptor gọi khi một request lỗi mạng hoặc 502/503/504: kiểm tra lại /health, tối đa mỗi 10 giây một lần */
export function reportUnreachable() {
  const now = Date.now();
  if (down || now - lastReportAt < 10_000) return;
  lastReportAt = now;
  probeServer();
}
