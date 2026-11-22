import { generateJson } from '../providers/llmProvider.js';

/** Nhóm lỗi để hiện nhãn "Bản mẫu (...)": quota | overloaded | config | budget | disabled | invalid_output (v1.23: budget, disabled) */
export function failureReason(err) {
  const reason = err?.details?.find?.((d) => d.field === 'reason')?.message;
  return ['quota', 'overloaded', 'config', 'budget', 'disabled'].includes(reason) ? reason : 'invalid_output';
}

/**
 * Gọi LLM đúng một lần (qua llmProvider, đã có retry). `gate` là bên ngoài (lưu DB, hạn mức) cắm vào:
 * `acquire()` chạy ngay trước khi gọi (có thể ném RATE_LIMITED, lỗi này không bị nuốt), `release()` chạy khi LLM lỗi
 * để hoàn lại lượt. LLM lỗi không ném: trả { data: null, failure }.
 */
export async function runLlm(opts, gate) {
  // Chế độ offline (dữ liệu mẫu của seed): không gọi LLM, coi như LLM không dùng được vì lý do `gate.offline`
  if (gate?.offline) return { data: null, failure: gate.offline };
  await gate?.acquire?.();
  try {
    return { data: await generateJson(opts), failure: null };
  } catch (err) {
    await gate?.release?.();
    return { data: null, failure: failureReason(err) };
  }
}

export const clip = (text, max) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};
