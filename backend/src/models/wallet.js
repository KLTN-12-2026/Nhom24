import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Ví điểm của ứng viên. Số dư không bao giờ âm; chỉ đổi qua modules/wallet/ledger.js
const walletSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, unique: true },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: 'Số dư phải là số nguyên' },
    },
  },
  { timestamps: true, collection: 'wallets' },
);

export const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
