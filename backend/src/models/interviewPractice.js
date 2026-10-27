import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

// Lịch sử luyện phỏng vấn
const interviewPracticeSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    setId: { type: ObjectId, ref: 'AiToolResult', required: true },
    questionId: { type: String, required: true },
    answer: { type: String, required: true },
    answerHash: { type: String, required: true },
    result: { type: Mixed, required: true }, // { strengths, improvements, score }
    aiGenerated: { type: Boolean, required: true, default: false },
    aiFailureReason: { type: String, default: null },
  },
  { timestamps: true, collection: 'interviewPractices' },
);

interviewPracticeSchema.index({ setId: 1, createdAt: -1 });
interviewPracticeSchema.index({ userId: 1, setId: 1, questionId: 1, answerHash: 1 });

export const InterviewPractice =
  mongoose.models.InterviewPractice || mongoose.model('InterviewPractice', interviewPracticeSchema);
