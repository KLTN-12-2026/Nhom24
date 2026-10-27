import mongoose from 'mongoose';

// Token xác minh email / đặt lại mật khẩu (tokenHash = SHA-256 của token ngẫu nhiên) và mã OTP điện thoại (tokenHash = HMAC của mã 6 số)
const verificationTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, enum: ['email', 'phone', 'password_reset'] },
    tokenHash: { type: String, required: true },
    phone: String, // số điện thoại mà mã OTP gửi tới
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: Date,
    revokedAt: Date, // bị thay bằng token mới hơn
    purgeAt: { type: Date, required: true }, // TTL: giữ thêm sau khi hết hạn để báo "hết hạn" thay vì "không hợp lệ"
  },
  { timestamps: true, collection: 'verificationTokens' },
);

verificationTokenSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
verificationTokenSchema.index({ userId: 1, type: 1, createdAt: -1 });
verificationTokenSchema.index({ tokenHash: 1 });

export const VerificationToken =
  mongoose.models.VerificationToken || mongoose.model('VerificationToken', verificationTokenSchema);
