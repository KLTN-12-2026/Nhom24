import mongoose from 'mongoose';
import { WALLET } from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

// Giữ chỗ điểm / lượt, đồng thời là khóa chống lặp khi bấm đúp
const walletHoldSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    tool: { type: String, required: true, enum: WALLET.TOOLS },
    source: { type: String, required: true, enum: ['pending', 'free', 'points'], default: 'pending' },
    points: { type: Number, required: true, min: 0, default: 0 },
    freeDay: String,
    status: { type: String, required: true, enum: ['held', 'committed', 'released'], default: 'held' },
    lockKey: { type: String, required: true },
    finishedAt: Date,
    expireAt: Date,
  },
  { timestamps: true, collection: 'walletHolds' },
);

// Chỉ một giữ chỗ đang mở cho mỗi khóa: yêu cầu giống hệt chạy cùng lúc thì yêu cầu sau bị từ chối
walletHoldSchema.index({ lockKey: 1 }, { unique: true, partialFilterExpression: { status: 'held' } });
walletHoldSchema.index({ status: 1, createdAt: 1 });
walletHoldSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const WalletHold = mongoose.models.WalletHold || mongoose.model('WalletHold', walletHoldSchema);
