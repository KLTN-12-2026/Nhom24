import mongoose from 'mongoose';
import { ROLES, USER_STATUS } from '../config/constants.js';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // v1.15: tài khoản chỉ đăng nhập bằng Google thì không có mật khẩu
    passwordHash: {
      type: String,
      required() {
        return !this.googleId;
      },
      select: false,
    },
    googleId: { type: String, trim: true }, // v1.15: `sub` của Google, chỉ nối khi email Google đã xác minh
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true }, // v1.14: dạng chuẩn hóa 0xxxxxxxxx
    avatarPath: String, // v1.22: avatars/{uuid}.webp, tương đối so với UPLOAD_DIR
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: Date,
    phoneVerified: { type: Boolean, default: false },
    phoneVerifiedAt: Date,
    role: { type: String, required: true, enum: ROLES },
    status: { type: String, required: true, enum: USER_STATUS, default: 'active' },
    lastLoginAt: { type: Date },
    termsVersion: String, // v1.23: phiên bản Điều khoản + Quyền riêng tư đã đồng ý
    termsAcceptedAt: Date,
    deletedAt: Date, // v1.23: tài khoản đã xóa (chỉ còn vỏ ẩn danh)
    // v1.19: công tắc thông báo; tài khoản cũ không có trường này được coi là tất cả bật
    notificationSettings: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      newJobs: { type: Boolean, default: true },
      followedCompanies: { type: Boolean, default: true },
    },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
