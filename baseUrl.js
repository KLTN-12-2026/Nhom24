// Địa chỉ gốc của API: nguồn duy nhất cho axios và kiểm tra tình trạng máy chủ (tránh import vòng)
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
