import axios from 'axios';
import { STORAGE_KEYS } from '../constants';
import { getDeviceId } from '../utils/deviceId';
import { reportUnreachable } from '../utils/serverStatus';
import { API_BASE_URL } from './baseUrl';

const baseURL = API_BASE_URL;

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export const tokenStore = {
  getAccess: () => read(STORAGE_KEYS.accessToken),
  getRefresh: () => read(STORAGE_KEYS.refreshToken),
  set(accessToken, refreshToken) {
    try {
      if (accessToken) localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
      if (refreshToken) localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
    } catch {
      /* localStorage không dùng được */
    }
  },
  clear() {
    try {
      Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    } catch {
      /* localStorage không dùng được */
    }
  },
};

// AuthContext đăng ký hàm này để biết khi nào phải đăng xuất (refresh lỗi)
let onAuthFailure = () => {};
export const setAuthFailureHandler = (fn) => {
  onAuthFailure = fn;
};

const api = axios.create({ baseURL, timeout: 70000 });
// Client riêng không có interceptor, dùng cho /auth/refresh để tránh lặp vô hạn
const bare = axios.create({ baseURL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Device-Id'] = getDeviceId(); // v1.23: giới hạn tần suất theo thiết bị
  return config;
});

let refreshPromise = null;

function refreshTokens() {
  // Nhiều request 401 cùng lúc dùng chung một lần refresh
  if (!refreshPromise) {
    const refreshToken = tokenStore.getRefresh();
    if (!refreshToken) return Promise.reject(new Error('NO_REFRESH_TOKEN'));
    refreshPromise = bare
      .post('/auth/refresh', { refreshToken })
      .then((res) => {
        const { accessToken, refreshToken: newRefresh } = res.data.data;
        tokenStore.set(accessToken, newRefresh);
        return accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// /auth/password trả 401 khi sai mật khẩu hiện tại: không phải token hết hạn nên không refresh và gửi lại
const SKIP_REFRESH = ['/auth/login', '/auth/admin/login', '/auth/register', '/auth/refresh', '/auth/password', '/auth/forgot-password', '/auth/reset-password', '/auth/account'];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error;
    // Mất kết nối hoặc 502/503/504: nhờ /health xác nhận trước khi hiện trang bảo trì
    if (!response || [502, 503, 504].includes(response.status)) reportUnreachable();
    const isAuthCall = SKIP_REFRESH.some((p) => config?.url?.startsWith(p));
    if (response?.status === 401 && config && !config._retried && !isAuthCall) {
      config._retried = true; // chỉ thử lại đúng 1 lần
      try {
        const accessToken = await refreshTokens();
        config.headers.Authorization = `Bearer ${accessToken}`;
        return api(config);
      } catch (refreshError) {
        // Chỉ đăng xuất khi refresh bị từ chối; lỗi retry của request gốc thì trả nguyên
        if (refreshError?.config?.url === '/auth/refresh' || refreshError?.message === 'NO_REFRESH_TOKEN') {
          tokenStore.clear();
          onAuthFailure();
          return Promise.reject(error);
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

// Lấy thông báo lỗi tiếng Việt từ response theo mục 5.1
export function getErrorMessage(error, fallback = 'Đã xảy ra lỗi, vui lòng thử lại') {
  const err = error?.response?.data?.error;
  if (err?.message) return err.message;
  if (error?.code === 'ECONNABORTED') return 'Hết thời gian chờ phản hồi từ máy chủ';
  if (error && !error.response && error.request) return 'Không kết nối được máy chủ';
  return fallback;
}

export const getErrorCode = (error) => error?.response?.data?.error?.code;
export const getErrorDetails = (error) => error?.response?.data?.error?.details || [];

// Bóc lớp { success, data, meta }
export const unwrap = (res) => res.data.data;
export const unwrapList = (res) => ({ items: res.data.data, meta: res.data.meta });

export const apiBaseURL = baseURL;
export default api;
