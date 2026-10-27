export const sendSuccess = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const sendList = (res, data, meta, status = 200) =>
  res.status(status).json({ success: true, data, meta });

export const buildMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});
