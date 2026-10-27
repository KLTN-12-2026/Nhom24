/** Bỏ dấu tiếng Việt, chữ thường, gộp khoảng trắng: "Kế toán" -> "ke toan" (dùng cho tìm kiếm không dấu) */
export const foldText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
