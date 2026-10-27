import mongoose from 'mongoose';

const { Mixed } = mongoose.Schema.Types;

// Thống kê và cầu dao ngân sách AI toàn hệ thống theo ngày giờ Việt Nam
const aiDailyStatSchema = new mongoose.Schema(
  {
    day: { type: String, required: true, unique: true }, // YYYY-MM-DD
    calls: { type: Number, required: true, default: 0 },
    byTool: { type: Mixed, default: {} }, // { [tool]: { calls, results, templates } }
    failures: { type: Mixed, default: {} }, // { quota, overloaded, config, invalid_output }
    blocked: { type: Mixed, default: {} }, // { budget, disabled }
    warnedAt: Date,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'aiDailyStats', minimize: false },
);

aiDailyStatSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiDailyStat = mongoose.models.AiDailyStat || mongoose.model('AiDailyStat', aiDailyStatSchema);
