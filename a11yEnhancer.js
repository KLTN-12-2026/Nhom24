// Lớp bảo hiểm trợ năng cho phần HTML do Ant Design sinh ra mà ta không viết trực tiếp:
//  - biểu tượng antd có aria-label tiếng Anh ("left", "search", "close"...): ẩn khỏi trình đọc màn hình nếu đã có chữ
//    đi kèm, không thì dịch sang tiếng Việt;
//  - nút Trước / Sau của phân trang, ô tìm của Select, nút xóa nội dung: thiếu tên thì gắn tên tiếng Việt.
// Chạy sau mỗi lần DOM đổi (gộp theo khung hình). Không thay đổi giao diện.

const ICON_LABELS = {
  left: 'Trước',
  right: 'Sau',
  search: 'Tìm kiếm',
  close: 'Đóng',
  'close-circle': 'Xóa',
  'check-circle': 'Thành công',
  'exclamation-circle': 'Cảnh báo',
  'info-circle': 'Thông tin',
  'warning': 'Cảnh báo',
  loading: 'Đang tải',
  calendar: 'Lịch',
  'down': 'Mở danh sách',
  'up': 'Đóng danh sách',
  upload: 'Tải lên',
  delete: 'Xóa',
  edit: 'Sửa',
  eye: 'Xem',
  plus: 'Thêm',
  bell: 'Thông báo',
  menu: 'Menu',
  'question-circle': 'Trợ giúp',
  'more': 'Thêm thao tác',
  'ellipsis': 'Thêm thao tác',
};

const ownText = (el, icon) => {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.anticon').forEach((n) => n.remove());
  return (clone.textContent || '').trim();
};

function fixIcons(root) {
  root.querySelectorAll('.anticon[role="img"]').forEach((icon) => {
    if (icon.dataset.a11y) return;
    icon.dataset.a11y = '1';
    const host = icon.closest('button, a, [role="button"], [role="menuitem"], li, label') || icon.parentElement;
    const hasName = host && (host.getAttribute('aria-label') || host.getAttribute('title') || ownText(host, icon));
    if (hasName) {
      icon.setAttribute('aria-hidden', 'true');
      icon.removeAttribute('aria-label');
      return;
    }
    const english = icon.getAttribute('aria-label');
    const vi = ICON_LABELS[english];
    if (vi) icon.setAttribute('aria-label', vi);
    else icon.setAttribute('aria-hidden', 'true');
  });
}

function fixPagination(root) {
  root.querySelectorAll('.ant-pagination li[title] > button:not([aria-label]), .ant-pagination li[title] > .ant-pagination-item-link:not([aria-label])').forEach((btn) => {
    const title = btn.parentElement.getAttribute('title');
    if (title) btn.setAttribute('aria-label', title);
  });
  root.querySelectorAll('.ant-pagination-prev button:not([aria-label])').forEach((b) => b.setAttribute('aria-label', 'Trang trước'));
  root.querySelectorAll('.ant-pagination-next button:not([aria-label])').forEach((b) => b.setAttribute('aria-label', 'Trang sau'));
}

function fixSelects(root) {
  root.querySelectorAll('input.ant-select-selection-search-input:not([aria-label]):not([aria-labelledby])').forEach((input) => {
    const select = input.closest('.ant-select');
    const formLabel = input.closest('.ant-form-item')?.querySelector('.ant-form-item-label label')?.textContent;
    const placeholder = select?.querySelector('.ant-select-selection-placeholder')?.textContent;
    const chosen = select?.querySelector('.ant-select-selection-item')?.textContent;
    const name = (formLabel || placeholder || chosen || '').trim();
    input.setAttribute('aria-label', name || 'Chọn một giá trị');
  });
}

function fixClearButtons(root) {
  root.querySelectorAll('.ant-input-clear-icon:not([aria-label]), .ant-input-clear-icon-has-suffix:not([aria-label])').forEach((b) => b.setAttribute('aria-label', 'Xóa nội dung đã nhập'));
  root.querySelectorAll('.ant-picker-clear:not([aria-label]), .ant-select-clear:not([aria-label])').forEach((b) => {
    b.setAttribute('aria-label', 'Xóa lựa chọn');
    b.setAttribute('role', 'button');
  });
}

export function enhanceA11y(root = document) {
  fixIcons(root);
  fixPagination(root);
  fixSelects(root);
  fixClearButtons(root);
}

export function installA11yEnhancer() {
  if (typeof document === 'undefined' || document.documentElement.dataset.a11yEnhancer) return;
  document.documentElement.dataset.a11yEnhancer = '1';
  let scheduled = false;
  const run = () => {
    scheduled = false;
    enhanceA11y(document);
  };
  new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(run);
    }
  }).observe(document.body, { childList: true, subtree: true });
  run();
}
