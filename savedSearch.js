import {
  EMPLOYMENT_TYPE_LABEL,
  JOB_CATEGORY_LABEL,
  LEVEL_LABEL,
  WORK_MODE_LABEL,
} from '../constants';
import { toMillion } from '../components/jobFormat';

const M = 1e6;

// Mức lương là các khoảng dựng sẵn; URL lưu mã (salary=10-20), API nhận salaryMin/salaryMax
export const SALARY_RANGES = {
  lt10: { label: 'Dưới 10 triệu', params: { salaryMax: 10 * M } },
  '10-20': { label: '10 - 20 triệu', params: { salaryMin: 10 * M, salaryMax: 20 * M } },
  '20-30': { label: '20 - 30 triệu', params: { salaryMin: 20 * M, salaryMax: 30 * M } },
  '30-50': { label: '30 - 50 triệu', params: { salaryMin: 30 * M, salaryMax: 50 * M } },
  gt50: { label: 'Trên 50 triệu', params: { salaryMin: 50 * M } },
};

const toTrieu = (n) => `${toMillion(n)} triệu`; // cùng cách viết với formatSalary: dấu phẩy thập phân (1,5 triệu)

/** Nhãn mức lương của bộ lọc đã lưu: khớp khoảng dựng sẵn thì dùng tên khoảng, không thì mô tả theo số */
export function salaryLabel({ salaryMin, salaryMax }) {
  const preset = Object.values(SALARY_RANGES).find((r) => r.params.salaryMin === salaryMin && r.params.salaryMax === salaryMax);
  if (preset) return preset.label;
  if (salaryMin != null && salaryMax != null) return `${toTrieu(salaryMin)} - ${toTrieu(salaryMax)}`;
  return salaryMin != null ? `Từ ${toTrieu(salaryMin)}` : `Đến ${toTrieu(salaryMax)}`;
}

/** Danh sách nhãn mô tả bộ lọc đã lưu, dùng cho chip và tên gợi ý */
export function filterLabels(filters = {}) {
  return [
    filters.q && `Từ khóa: ${filters.q}`,
    filters.city,
    ...(filters.category || []).map((v) => JOB_CATEGORY_LABEL[v] || v),
    ...(filters.level || []).map((v) => LEVEL_LABEL[v] || v),
    ...(filters.employmentType || []).map((v) => EMPLOYMENT_TYPE_LABEL[v] || v),
    ...(filters.workMode || []).map((v) => WORK_MODE_LABEL[v] || v),
    (filters.salaryMin != null || filters.salaryMax != null) && `Lương: ${salaryLabel(filters)}`,
  ].filter(Boolean);
}

/** Query string của trang /jobs ứng với bộ lọc đã lưu. Mức lương tự chọn (ngoài khoảng dựng sẵn) không biểu diễn được trên URL. */
export function filtersToSearch(filters = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.city) params.set('city', filters.city);
  for (const key of ['category', 'level', 'employmentType', 'workMode']) {
    (filters[key] || []).forEach((v) => params.append(key, v));
  }
  const code = Object.entries(SALARY_RANGES).find(
    ([, r]) => r.params.salaryMin === filters.salaryMin && r.params.salaryMax === filters.salaryMax,
  )?.[0];
  if (code) params.set('salary', code);
  return params.toString();
}

export const FREQUENCY_LABEL = { instant: 'Ngay khi có tin mới', daily: 'Tổng hợp mỗi ngày', off: 'Tắt thông báo' };
export const FREQUENCY_OPTIONS = Object.entries(FREQUENCY_LABEL).map(([value, label]) => ({ value, label }));
