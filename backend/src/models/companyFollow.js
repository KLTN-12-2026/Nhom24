import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// v1.19: ứng viên theo dõi công ty để nhận thông báo khi có tin mới được duyệt
const companyFollowSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    companyId: { type: ObjectId, ref: 'Company', required: true },
  },
  { timestamps: true, collection: 'companyFollows' },
);

companyFollowSchema.index({ userId: 1, companyId: 1 }, { unique: true });
companyFollowSchema.index({ companyId: 1 });

export const CompanyFollow = mongoose.models.CompanyFollow || mongoose.model('CompanyFollow', companyFollowSchema);
