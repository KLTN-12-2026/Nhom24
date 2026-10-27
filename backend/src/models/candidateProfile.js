import mongoose from 'mongoose';
import {
  CV_PARSE_STATUS,
  EDUCATION,
  JOB_CATEGORY,
  LEVEL,
  SKILL_LEVEL,
  SKILL_TYPE,
} from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

const skillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalized: { type: String, trim: true },
    type: { type: String, enum: SKILL_TYPE },
    level: { type: String, enum: SKILL_LEVEL, default: 'unknown' },
  },
  { _id: false },
);

const experienceSchema = new mongoose.Schema(
  {
    company: String,
    title: String,
    startDate: String, // YYYY-MM
    endDate: String, // YYYY-MM
    isCurrent: { type: Boolean, default: false },
    description: String,
    technologies: [String],
  },
  { _id: false },
);

const educationSchema = new mongoose.Schema(
  {
    school: String,
    degree: { type: String, enum: EDUCATION },
    major: String,
    startYear: Number,
    endYear: Number,
    gpa: String,
  },
  { _id: false },
);

const candidateProfileSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, unique: true },
    headline: String,
    about: String,
    location: String,
    dateOfBirth: Date,
    targetRole: String,
    targetCategory: { type: String, enum: JOB_CATEGORY },
    expectedSalary: {
      min: Number,
      max: Number,
      currency: { type: String, default: 'VND' },
    },
    skills: [skillSchema],
    experiences: [experienceSchema],
    educations: [educationSchema],
    certifications: [{ _id: false, name: String, issuer: String, year: Number }],
    languages: [{ _id: false, name: String, level: String }],
    totalYearsExperience: Number,
    highestEducation: { type: String, enum: EDUCATION },
    primaryField: { type: String, enum: JOB_CATEGORY },
    seniority: { type: String, enum: LEVEL },
    cv: {
      originalName: String,
      storedPath: String,
      mimeType: String,
      size: Number,
      uploadedAt: Date,
      textHash: String,
      parseStatus: { type: String, enum: CV_PARSE_STATUS, default: 'none' },
      parseError: String,
      parsedAt: Date,
      aiConfidence: Number,
      warnings: [String],
      parsed: { type: mongoose.Schema.Types.Mixed, select: false }, // CVParsed gần nhất, ẩn mặc định (mục 8.2)
    },
    profileEmbedding: { type: [Number], select: false },
    embeddingHash: String,
    isPublic: { type: Boolean, default: true }, // v1.23: mặc định bật cho hồ sơ mới
    savedJobIds: [{ type: ObjectId, ref: 'Job' }],
  },
  {
    timestamps: true,
    collection: 'candidateProfiles',
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        if (ret.cv) delete ret.cv.storedPath; // không bao giờ trả storedPath (mục 9)
        return ret;
      },
    },
  },
);

candidateProfileSchema.index({ isPublic: 1 });

export const CandidateProfile =
  mongoose.models.CandidateProfile || mongoose.model('CandidateProfile', candidateProfileSchema);
