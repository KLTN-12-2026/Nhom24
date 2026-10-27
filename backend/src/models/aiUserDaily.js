import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Số lượt gọi LLM thật của từng người mỗi ngày, mọi công cụ
const aiUserDailySchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    day: { type: String, required: true },
    calls: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'aiUserDailies' },
);

aiUserDailySchema.index({ userId: 1, day: 1 }, { unique: true });
aiUserDailySchema.index({ day: 1, calls: -1 });
aiUserDailySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiUserDaily = mongoose.models.AiUserDaily || mongoose.model('AiUserDaily', aiUserDailySchema);
