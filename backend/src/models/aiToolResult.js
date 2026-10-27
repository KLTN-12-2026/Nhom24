import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

// Kết quả ba công cụ AI của ứng viên. Cache chỉ dùng bản `aiGenerated=true` cùng `inputHash`.
const aiToolResultSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    jobId: { type: ObjectId, ref: 'Job', required: true },
    kind: { type: String, required: true, enum: ['cv_review', 'cover_letter', 'interview_set'] },
    inputHash: { type: String, required: true },
    aiGenerated: { type: Boolean, required: true, default: false },
    result: { type: Mixed, required: true },
    seeded: { type: Boolean, default: false }, // dữ liệu mẫu từ seed
  },
  { timestamps: true, collection: 'aiToolResults' },
);

aiToolResultSchema.index({ userId: 1, kind: 1, jobId: 1, inputHash: 1, createdAt: -1 });

export const AiToolResult = mongoose.models.AiToolResult || mongoose.model('AiToolResult', aiToolResultSchema);
