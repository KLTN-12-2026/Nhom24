/** Bỏ dấu tiếng Việt, chữ thường: "Đà Nẵng" -> "da nang" (khớp foldText của backend) */
export const foldText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
