import mongoose from 'mongoose';
import { REPORT_REASON, REPORT_STATUS } from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

const jobReportSchema = new mongoose.Schema(
  {
    jobId: { type: ObjectId, ref: 'Job', required: true },
    reporterId: { type: ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, enum: REPORT_REASON },
    detail: String,
    status: { type: String, required: true, enum: REPORT_STATUS, default: 'open' },
    resolution: { type: String, enum: ['dismiss', 'remove'] },
    adminNote: String,
    resolvedBy: { type: ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
  { timestamps: true, collection: 'jobReports', toJSON: { transform: (doc, ret) => { delete ret.__v; return ret; } } },
);

jobReportSchema.index({ jobId: 1, reporterId: 1 }, { unique: true });
jobReportSchema.index({ status: 1, createdAt: -1 });

export const JobReport = mongoose.models.JobReport || mongoose.model('JobReport', jobReportSchema);
