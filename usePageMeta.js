import { useEffect } from 'react';
import { DEFAULT_OG_IMAGE, siteOrigin } from '../seo/site';

export const SITE_NAME = 'Tuyển dụng AI';
const DEFAULT_TITLE = `${SITE_NAME}: tìm việc theo kỹ năng, xem điểm phù hợp`;
const DEFAULT_DESCRIPTION =
  'Tìm việc làm theo kỹ năng trong CV, xem điểm phù hợp với từng tin tuyển dụng. Nền tảng tuyển dụng demo phục vụ đồ án tốt nghiệp.';
const MAX_DESCRIPTION = 160;

function upsertMeta(attr, key, content) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function removeMeta(attr, key) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

const clip = (text) => {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length <= MAX_DESCRIPTION ? t : `${t.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`;
};

/**
 * Đặt tiêu đề tab, mô tả, canonical, Open Graph / Twitter card cho trang hiện tại.
 * Không truyền title (trang chủ) thì dùng tiêu đề mặc định.
 * options: { noindex, path (đường dẫn canonical, mặc định pathname hiện tại, bỏ query), type ('website' | 'article'), image }
 */
export default function usePageMeta(title, description, options = {}) {
  const { noindex = false, path, type = 'website', image = DEFAULT_OG_IMAGE } = options;
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
    const desc = clip(description || DEFAULT_DESCRIPTION);
    const origin = siteOrigin();
    const url = origin + (path ?? window.location.pathname);
    const imageUrl = /^https?:/.test(image) ? image : origin + image;

    document.title = fullTitle;
    upsertMeta('name', 'description', desc);
    setCanonical(url);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:locale', 'vi_VN');
    upsertMeta('property', 'og:image', imageUrl);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', desc);
    upsertMeta('name', 'twitter:image', imageUrl);

    if (noindex) upsertMeta('name', 'robots', 'noindex, nofollow');
    else removeMeta('name', 'robots');
    return () => removeMeta('name', 'robots'); // trang kế tiếp tự đặt lại nếu cần
  }, [title, description, noindex, path, type, image]);
}

/** Khu riêng tư (bảng điều khiển, tài khoản, đăng nhập): không cho công cụ tìm kiếm lập chỉ mục */
export function useNoIndex() {
  useEffect(() => {
    upsertMeta('name', 'robots', 'noindex, nofollow');
    return () => removeMeta('name', 'robots');
  }, []);
}
