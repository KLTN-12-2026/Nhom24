import { MATCH } from '../../config/constants.js';

const isVector = (v) => Array.isArray(v) && v.length > 0;

/** Cosine trong Node. Embedding đã chuẩn hóa L2 nên thực chất là tích vô hướng; vẫn chia cho độ dài để an toàn. Không tính được thì trả null */
export function cosine(a, b) {
  if (!isVector(a) || !isVector(b) || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  return dot / Math.sqrt(na * nb);
}

/**
 * semantic trong [0,1]: clamp((cosine − SEMANTIC_FLOOR) / SEMANTIC_RANGE, 0, 1).
 * Thiếu embedding (hoặc lệch độ dài) thì score = 0 kèm `note`.
 */
export function computeSemantic(profileEmbedding, jobEmbedding) {
  if (!isVector(profileEmbedding) || !isVector(jobEmbedding)) {
    return { score: 0, cosine: null, available: false, note: 'Thiếu embedding nên điểm ngữ nghĩa được tính là 0' };
  }
  const cos = cosine(profileEmbedding, jobEmbedding);
  if (cos === null) {
    return { score: 0, cosine: null, available: false, note: 'Embedding không hợp lệ (lệch độ dài hoặc vector 0) nên điểm ngữ nghĩa được tính là 0' };
  }
  const raw = (cos - MATCH.SEMANTIC_FLOOR) / MATCH.SEMANTIC_RANGE;
  return { score: Math.min(1, Math.max(0, raw)), cosine: cos, available: true, note: null };
}
