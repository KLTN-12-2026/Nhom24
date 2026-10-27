import mongoose from 'mongoose';
import { WALLET } from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

// Sổ cái chỉ thêm: không có đường nào sửa; model chặn mọi lệnh cập nhật
const walletTransactionSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, enum: WALLET.TX_TYPES },
    points: {
      type: Number,
      required: true,
      validate: { validator: (n) => Number.isInteger(n) && n !== 0, message: 'Số điểm phải là số nguyên khác 0' },
    },
    balanceAfter: { type: Number, required: true, min: 0 },
    refType: { type: String, enum: ['order', 'hold', 'admin', 'account'] },
    refId: String,
    tool: { type: String, enum: WALLET.TOOLS },
    reason: String,
    actorId: { type: ObjectId, ref: 'User' },
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'walletTransactions' },
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ type: 1, createdAt: -1 });
walletTransactionSchema.index({ refType: 1, refId: 1 });

const blocked = () => {
  throw new Error('Sổ cái ví chỉ được thêm, không được sửa');
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne']) {
  walletTransactionSchema.pre(op, blocked);
}
walletTransactionSchema.pre('save', function guard(next) {
  if (!this.isNew) return next(new Error('Sổ cái ví chỉ được thêm, không được sửa'));
  next();
});

export const WalletTransaction =
  mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', walletTransactionSchema);
