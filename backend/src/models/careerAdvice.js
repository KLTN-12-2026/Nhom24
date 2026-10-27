import mongoose from 'mongoose';
import { JOB_CATEGORY } from '../config/constants.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const careerAdviceSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    profileId: { type: ObjectId, ref: 'CandidateProfile', required: true },
    targetRole: { type: String, required: true },
    targetCategory: { type: String, required: true, enum: JOB_CATEGORY },
    result: { type: Mixed, required: true }, // CareerAdvice (mục 7.3)
    inputHash: { type: String, index: true }, // băm hồ sơ + mục tiêu + thị trường, để dùng lại kết quả (mục 6.8)
    aiGenerated: { type: Boolean, default: false }, // chỉ bản do LLM viết mới được dùng lại làm cache
  },
  { timestamps: true, collection: 'careerAdvices' },
);

careerAdviceSchema.index({ userId: 1, createdAt: -1 });

export const CareerAdvice =
  mongoose.models.CareerAdvice || mongoose.model('CareerAdvice', careerAdviceSchema);
