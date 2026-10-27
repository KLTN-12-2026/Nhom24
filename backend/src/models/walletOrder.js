import mongoose from 'mongoose';
import { WALLET } from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

// Đơn nạp điểm. Không lưu thông tin thẻ hay chuỗi callback thô
const walletOrderSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    packageId: { type: String, required: true },
    amountVnd: { type: Number, required: true, min: 1 },
    points: { type: Number, required: true, min: 1 },
    bonusPoints: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, required: true, enum: WALLET.ORDER_STATUS, default: 'pending' },
    provider: { type: String, required: true },
    txnRef: { type: String, required: true, unique: true },
    gatewayTxnId: String,
    gatewayResponseCode: String,
    paidAt: Date,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'walletOrders' },
);

walletOrderSchema.index({ userId: 1, createdAt: -1 });
walletOrderSchema.index({ status: 1, expiresAt: 1 });

export const WalletOrder = mongoose.models.WalletOrder || mongoose.model('WalletOrder', walletOrderSchema);
