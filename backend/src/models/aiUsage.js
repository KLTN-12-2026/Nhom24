import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Đếm lượt AI theo người và theo ngày giờ Việt Nam
const aiUsageSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    day: { type: String, required: true }, // YYYY-MM-DD
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'aiUsages' },
);

aiUsageSchema.index({ userId: 1, day: 1 }, { unique: true });
aiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiUsage = mongoose.models.AiUsage || mongoose.model('AiUsage', aiUsageSchema);
