/**
 * Document Mongoose -> object trả về client. Giữ nguyên `_id` và bổ sung `id` (chuỗi)
 * cho thống nhất với `user.id` của module auth. Các transform trong model (ẩn __v, storedPath) vẫn áp dụng.
 */
export function toDto(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (obj._id) obj.id = String(obj._id);
  return obj;
}
