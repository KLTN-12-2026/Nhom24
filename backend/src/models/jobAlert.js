import mongoose from 'mongoose';
import { PRIVACY } from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

const matchSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: ['search', 'company'] },
    refId: { type: ObjectId, required: true },
    name: { type: String, default: '' },
  },
  { _id: false },
);

// v1.19: mỗi cặp (người nhận, tin) chỉ có một dòng nhờ unique index, nên không bao giờ báo trùng một tin cho cùng người
const jobAlertSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    jobId: { type: ObjectId, ref: 'Job', required: true },
    mode: { type: String, required: true, enum: ['instant', 'daily'] },
    status: { type: String, required: true, enum: ['pending', 'sent'] },
    matches: { type: [matchSchema], required: true },
    sentAt: Date,
    emailedAt: Date,
  },
  { timestamps: true, collection: 'jobAlerts' },
);

jobAlertSchema.index({ userId: 1, jobId: 1 }, { unique: true });
jobAlertSchema.index({ status: 1, mode: 1 });
jobAlertSchema.index({ userId: 1, createdAt: -1 });
// v1.23: lịch sử báo việc cũ tự xóa
jobAlertSchema.index({ createdAt: 1 }, { expireAfterSeconds: PRIVACY.ALERT_TTL_DAYS * 86400 });

export const JobAlert = mongoose.models.JobAlert || mongoose.model('JobAlert', jobAlertSchema);
