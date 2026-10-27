import mongoose from 'mongoose';
import { APPLICATION_STATUS, INTERVIEW_CONFIRMATION, INTERVIEW_MODE, MESSAGE_SENDER } from '../config/constants.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const applicationSchema = new mongoose.Schema(
  {
    jobId: { type: ObjectId, ref: 'Job', required: true },
    candidateId: { type: ObjectId, ref: 'User', required: true },
    profileId: { type: ObjectId, ref: 'CandidateProfile', required: true },
    status: { type: String, required: true, enum: APPLICATION_STATUS, default: 'submitted' },
    coverLetter: String,
    // Bản sao `cv` của hồ sơ + `parsedSnapshot` (CVParsed) tại thời điểm nộp
    cvSnapshot: {
      type: new mongoose.Schema(
        {
          originalName: String,
          storedPath: String,
          mimeType: String,
          size: Number,
          uploadedAt: Date,
          textHash: String,
          parseStatus: String,
          parseError: String,
          parsedAt: Date,
          aiConfidence: Number,
          warnings: [String],
          parsedSnapshot: Mixed,
        },
        { _id: false },
      ),
      required: true,
    },
    matchScore: { type: Number, min: 0, max: 100 },
    matchBreakdown: Mixed,
    // Dữ liệu nội bộ của employer (v1.20: thêm rating, reviewedAt): không bao giờ trả cho ứng viên
    employerNote: String,
    rating: { type: Number, min: 1, max: 5 },
    reviewedAt: Date,
    rejectionReason: String, // ứng viên thấy được
    interview: {
      type: new mongoose.Schema(
        {
          scheduledAt: { type: Date, required: true },
          durationMinutes: Number,
          mode: { type: String, enum: INTERVIEW_MODE, required: true },
          location: { type: String, required: true },
          message: String,
          confirmation: { type: String, enum: INTERVIEW_CONFIRMATION, default: 'pending' },
          respondedAt: Date,
          proposedAt: Date,
          responseNote: String,
          rescheduleCount: { type: Number, default: 0 },
          updatedAt: Date,
        },
        { _id: false },
      ),
    },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: APPLICATION_STATUS },
        from: { type: String, enum: APPLICATION_STATUS },
        actorRole: { type: String, enum: MESSAGE_SENDER },
        reason: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: ObjectId, ref: 'User' },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'applications',
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        if (ret.cvSnapshot) delete ret.cvSnapshot.storedPath;
        return ret;
      },
    },
  },
);

applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });
applicationSchema.index({ jobId: 1, matchScore: -1 });
applicationSchema.index({ candidateId: 1, createdAt: -1 });
applicationSchema.index({ candidateId: 1, 'interview.scheduledAt': 1 });
applicationSchema.index({ jobId: 1, rating: -1 });

export const Application =
  mongoose.models.Application || mongoose.model('Application', applicationSchema);
