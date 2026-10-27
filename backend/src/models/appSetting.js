import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

// Cấu hình bật / tắt do admin đặt lúc chạy
const appSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Mixed, required: true },
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'appSettings' },
);

export const AppSetting = mongoose.models.AppSetting || mongoose.model('AppSetting', appSettingSchema);
