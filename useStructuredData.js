import { useEffect } from 'react';

/**
 * Gắn một khối JSON-LD vào <head> trong lúc trang đang hiển thị, gỡ khi rời trang hoặc khi `data` là null.
 * `key` phân biệt các khối (jobposting, breadcrumb...) để nhiều thành phần cùng đặt dữ liệu mà không đè nhau.
 */
export default function useStructuredData(key, data) {
  const json = data ? JSON.stringify(data) : null;
  useEffect(() => {
    if (!json) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.ld = key;
    script.textContent = json;
    document.head.appendChild(script);
    return () => script.remove();
  }, [key, json]);
}
