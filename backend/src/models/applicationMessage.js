import mongoose from 'mongoose';
import { MESSAGE_SENDER } from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

// Tin nhắn trong hồ sơ ứng tuyển (v1.20). `readAt`: lúc bên kia đọc, trống là chưa đọc.
const applicationMessageSchema = new mongoose.Schema(
  {
    applicationId: { type: ObjectId, ref: 'Application', required: true },
    senderId: { type: ObjectId, ref: 'User', required: true },
    senderRole: { type: String, required: true, enum: MESSAGE_SENDER },
    body: { type: String, required: true },
    readAt: Date,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'applicationMessages',
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

applicationMessageSchema.index({ applicationId: 1, createdAt: 1 });
applicationMessageSchema.index({ applicationId: 1, senderRole: 1, readAt: 1 });

export const ApplicationMessage =
  mongoose.models.ApplicationMessage || mongoose.model('ApplicationMessage', applicationMessageSchema);
