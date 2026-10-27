import mongoose from 'mongoose';
import { foldText } from '../utils/text.js';
import { canonicalOrSame } from '../utils/provinces.js';
import {
  AUTO_FLAG,
  EDUCATION,
  EMPLOYMENT_TYPE,
  JOB_CATEGORY,
  JOB_STATUS,
  LEVEL,
  PENDING_REASON,
  PUBLISH_SOURCE,
  WORK_MODE,
} from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

const jobSkillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalized: { type: String, trim: true },
  },
  { _id: false },
);

const jobSchema = new mongoose.Schema(
  {
    companyId: { type: ObjectId, ref: 'Company', required: true },
    employerId: { type: ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    requirements: { type: String, required: true },
    benefits: String,
    benefitList: [String], // v1.11: quyền lợi dạng mảng; trống thì API suy ra từ `benefits`
    howToApply: String,
    category: { type: String, required: true, enum: JOB_CATEGORY },
    level: { type: String, required: true, enum: LEVEL },
    employmentType: { type: String, required: true, enum: EMPLOYMENT_TYPE },
    workMode: { type: String, required: true, enum: WORK_MODE },
    city: { type: String, required: true, trim: true },
    address: String,
    salary: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
      currency: { type: String, default: 'VND' },
      negotiable: { type: Boolean, default: false },
    },
    requiredSkills: {
      type: [jobSkillSchema],
      validate: [(v) => Array.isArray(v) && v.length >= 1, 'Cần ít nhất 1 kỹ năng bắt buộc'],
    },
    niceToHaveSkills: [jobSkillSchema],
    minYearsExperience: { type: Number, default: 0 },
    maxYearsExperience: { type: Number, default: null },
    minEducation: { type: String, enum: EDUCATION, default: 'none' },
    vacancies: { type: Number, default: 1 },
    deadline: { type: Date, required: true },
    status: { type: String, required: true, enum: JOB_STATUS },
    reviewNote: String,
    submittedAt: Date, // v1.14: lần gửi duyệt gần nhất (đếm giới hạn tin gửi duyệt mỗi ngày của công ty chưa xác minh)
    publishedAt: Date, // ngày đăng (lần đầu published); tin cũ chưa có thì API dùng createdAt
    viewsCount: { type: Number, default: 0 },
    applicationsCount: { type: Number, default: 0 },
    // v1.12: bản không dấu, chữ thường của title/description để tìm kiếm; tự tính ở pre('validate')
    titleSearch: { type: String, select: false },
    descriptionSearch: { type: String, select: false },
    embedding: { type: [Number], select: false },
    embeddingHash: String,
    alertsDispatchedAt: Date, // v1.19: bộ phát thông báo đã xử lý xong tin này
    // v1.27: kiểm duyệt (mục 7.11). Chỉ admin thấy, ẩn khỏi mọi phản hồi khác ở toJSON
    publishSource: { type: String, enum: PUBLISH_SOURCE },
    pendingReason: { type: String, enum: PENDING_REASON },
    autoFlags: { type: [{ type: String, enum: AUTO_FLAG }], default: undefined },
    autoCheckedAt: Date,
    reviewedHash: String,
    lastReviewedAt: Date,
  },
  {
    timestamps: true,
    collection: 'jobs',
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.titleSearch;
        delete ret.descriptionSearch;
        delete ret.alertsDispatchedAt;
        for (const key of ['publishSource', 'pendingReason', 'autoFlags', 'autoCheckedAt', 'reviewedHash', 'lastReviewedAt']) {
          delete ret[key];
        }
        return ret;
      },
    },
  },
);

jobSchema.pre('validate', function normalizeCityName() {
  if (this.isModified('city')) this.city = canonicalOrSame(this.city);
});

jobSchema.pre('validate', function setSearchFields() {
  this.titleSearch = foldText(this.title);
  this.descriptionSearch = foldText(this.description);
});

jobSchema.index({ title: 'text', description: 'text' });
jobSchema.index({ status: 1, category: 1, city: 1, createdAt: -1 });
jobSchema.index({ status: 1, publishedAt: -1 });
jobSchema.index({ companyId: 1 });
jobSchema.index({ companyId: 1, submittedAt: -1 });
jobSchema.index({ 'requiredSkills.normalized': 1 });
jobSchema.index({ publishSource: 1, status: 1 });
jobSchema.index({ pendingReason: 1, status: 1 });

export const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);
