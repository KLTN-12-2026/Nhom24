import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const matchResultSchema = new mongoose.Schema(
  {
    profileId: { type: ObjectId, ref: 'CandidateProfile', required: true },
    jobId: { type: ObjectId, ref: 'Job', required: true },
    profileHash: { type: String, required: true },
    jobHash: { type: String, required: true },
    result: { type: Mixed, required: true }, // MatchResult (mục 7.2)
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'matchResults' },
);

matchResultSchema.index({ profileId: 1, jobId: 1 }, { unique: true });

export const MatchResult =
  mongoose.models.MatchResult || mongoose.model('MatchResult', matchResultSchema);
