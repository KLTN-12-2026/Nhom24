import mongoose from 'mongoose';
import { NOTIFICATION_TYPE, PRIVACY } from '../config/constants.js';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, enum: NOTIFICATION_TYPE },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: String,
    isRead: { type: Boolean, default: false },
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true, collection: 'notifications' },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
// v1.23: thông báo cũ tự xóa
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: PRIVACY.NOTIFICATION_TTL_DAYS * 86400 });

export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
