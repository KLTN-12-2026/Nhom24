import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// v1.19: token hủy đăng ký trong email. Chỉ lưu băm SHA-256; token gốc chỉ nằm trong thư.
const alertTokenSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    scope: { type: String, required: true, enum: ['search', 'company', 'all'] },
    refId: ObjectId,
    name: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'alertTokens' },
);

alertTokenSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const AlertToken = mongoose.models.AlertToken || mongoose.model('AlertToken', alertTokenSchema);
