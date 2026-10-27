import mongoose from 'mongoose';
import { AUTO_FLAG, JOB_STATUS, MODERATION_ACTION, PENDING_REASON } from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

// Nhật ký kiểm duyệt, chỉ thêm. Không lưu nội dung tin, chỉ tên trường đã đổi.
const moderationEventSchema = new mongoose.Schema(
  {
    jobId: { type: ObjectId, ref: 'Job' },
    companyId: { type: ObjectId, ref: 'Company' },
    actorId: { type: ObjectId, ref: 'User' },
    actorRole: { type: String, required: true, enum: ['employer', 'admin', 'system'] },
    action: { type: String, required: true, enum: MODERATION_ACTION },
    from: { type: String, enum: JOB_STATUS },
    to: { type: String, enum: JOB_STATUS },
    reason: { type: String, enum: PENDING_REASON },
    flags: { type: [{ type: String, enum: AUTO_FLAG }], default: undefined },
    fields: { type: [String], default: undefined },
    note: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'moderationEvents' },
);

moderationEventSchema.index({ jobId: 1, createdAt: -1 });
moderationEventSchema.index({ companyId: 1, action: 1, createdAt: -1 });

export const ModerationEvent =
  mongoose.models.ModerationEvent || mongoose.model('ModerationEvent', moderationEventSchema);
