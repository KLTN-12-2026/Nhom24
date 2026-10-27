import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tách thư viện ít đổi thành chunk riêng để trình duyệt cache lâu. Biểu tượng (@ant-design/icons) cố ý KHÔNG gom chung: gom vào
// một chunk nạp ngay thì mọi trang phải tải toàn bộ biểu tượng của cả ứng dụng (v1.24: bỏ, gói JS ban đầu nhẹ hơn ~40 kB)
function vendorChunk(id) {
  if (!id.includes('node_modules')) return undefined;
  if (/node_modules\/(react|react-dom|react-router|react-router-dom|@remix-run|scheduler)\//.test(id)) return 'vendor-react';
  if (/node_modules\/(@tanstack|axios|dayjs)\//.test(id)) return 'vendor-data';
  if (/node_modules\/(@ant-design\/(cssinjs|cssinjs-utils|colors|fast-color)|@emotion|stylis|@ctrl)\//.test(id)) return 'vendor-antd-style';
  return undefined;
}

// sitemap.xml và robots.txt do backend sinh. Khi triển khai, reverse proxy phải chuyển hai đường dẫn này
// về backend; cấu hình dưới đây làm điều đó cho dev (vite) và preview.
const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';
const seoProxy = { '/sitemap.xml': BACKEND, '/robots.txt': BACKEND };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: seoProxy },
  preview: { proxy: seoProxy },
  build: {
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
});
