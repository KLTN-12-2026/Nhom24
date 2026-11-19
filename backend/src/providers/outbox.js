/** Hộp thư/SMS trong bộ nhớ, chỉ dùng cho test (provider `memory`): giữ tối đa MAX bản gần nhất */
const MAX = 200;

export const createOutbox = () => {
  const items = [];
  return {
    items,
    push(item) {
      items.push({ ...item, sentAt: new Date() });
      if (items.length > MAX) items.shift();
    },
    clear() {
      items.length = 0;
    },
    last(predicate = () => true) {
      return [...items].reverse().find(predicate) ?? null;
    },
  };
};
