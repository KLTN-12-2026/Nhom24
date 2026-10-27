import { ERROR_STATUS } from '../config/constants.js';

export class ApiError extends Error {
  /**
   * @param {string} code  mã lỗi theo mục 5.1 của hợp đồng
   * @param {string} message  mô tả tiếng Việt
   * @param {Array<{field: string, message: string}>} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code] ?? 500;
    if (details) this.details = details;
  }
}
