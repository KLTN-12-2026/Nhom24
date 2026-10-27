import mongoose from 'mongoose';
import { foldText } from '../utils/text.js';
import { canonicalOrSame } from '../utils/provinces.js';
import { COMPANY_SIZE, COMPANY_VERIFICATION_STATUS } from '../config/constants.js';

const companySchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: String,
    industry: String,
    size: { type: String, enum: COMPANY_SIZE },
    website: String,
    address: String,
    city: String,
    logoPath: String,
    coverPath: String, // v1.22: covers/{uuid}.webp
    // v1.22: nhật ký đổi / xóa logo và ảnh bìa (20 lần gần nhất), chỉ chủ công ty và admin thấy
    imageChanges: {
      type: [
        new mongoose.Schema(
          {
            kind: { type: String, enum: ['logo', 'cover'] },
            action: { type: String, enum: ['set', 'remove'] },
            at: Date,
            wasVerified: Boolean,
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    foundedYear: Number,
    benefits: [String],
    tags: [String], // công nghệ / từ khóa nổi bật
    contactEmail: String,
    // v1.14: xác minh công ty
    taxCode: String,
    businessLicense: {
      type: new mongoose.Schema(
        { originalName: String, storedPath: String, mimeType: String, size: Number, uploadedAt: Date },
        { _id: false },
      ),
    },
    verificationStatus: { type: String, enum: COMPANY_VERIFICATION_STATUS, default: 'unverified' },
    verificationNote: String, // lý do từ chối
    verificationSubmittedAt: Date,
    verificationReviewedAt: Date,
    verificationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // v1.27: admin đặt thì mọi tin phải duyệt tay (chỉ admin thấy, ẩn ở toJSON)
    alwaysManualReview: { type: Boolean, default: false },
    manualReviewNote: String,
    manualReviewAt: Date,
    manualReviewBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // v1.12: bản không dấu, chữ thường của name/description để tìm kiếm; tự tính ở pre('validate')
    nameSearch: { type: String, select: false },
    descriptionSearch: { type: String, select: false },
  },
  {
    timestamps: true,
    collection: 'companies',
    toJSON: {
      transform(doc, ret) {
        for (const key of ['alwaysManualReview', 'manualReviewNote', 'manualReviewAt', 'manualReviewBy']) delete ret[key];
        return ret;
      },
    },
  },
);

companySchema.index({ verificationStatus: 1, verificationSubmittedAt: 1 });
companySchema.index({ taxCode: 1 }, { sparse: true });

companySchema.pre('validate', function normalizeCityName() {
  if (this.isModified('city') && this.city) this.city = canonicalOrSame(this.city);
});

companySchema.pre('validate', function setSearchFields() {
  this.nameSearch = foldText(this.name);
  this.descriptionSearch = foldText(this.description);
});

export const Company = mongoose.models.Company || mongoose.model('Company', companySchema);
