// Địa chỉ gốc công khai của site (dùng cho canonical, Open Graph, JSON-LD).
// VITE_SITE_URL (nếu đặt) thắng; không thì lấy theo trình duyệt. Không bao giờ kết thúc bằng dấu /.
export const siteOrigin = () => {
  const configured = import.meta.env?.VITE_SITE_URL;
  return String(configured || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
};

export const DEFAULT_OG_IMAGE = '/og-image.png';
