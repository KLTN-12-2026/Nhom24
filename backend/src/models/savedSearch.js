import mongoose from 'mongoose';
import { ALERTS, SAVED_SEARCH_FREQUENCY } from '../config/constants.js';

const { ObjectId } = mongoose.Schema.Types;

// v1.19: bộ lọc danh sách việc làm được lưu lại để báo tin mới. `filters` cùng dạng với query của GET /jobs.
const savedSearchSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: ALERTS.SEARCH_NAME_MAX },
    filters: { type: mongoose.Schema.Types.Mixed, required: true },
    filtersHash: { type: String, required: true },
    frequency: { type: String, required: true, enum: SAVED_SEARCH_FREQUENCY, default: 'instant' },
    lastAlertAt: Date,
  },
  {
    timestamps: true,
    collection: 'savedSearches',
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.filtersHash;
        return ret;
      },
    },
  },
);

savedSearchSchema.index({ userId: 1, filtersHash: 1 }, { unique: true });
savedSearchSchema.index({ userId: 1, createdAt: -1 });
savedSearchSchema.index({ frequency: 1 });

export const SavedSearch = mongoose.models.SavedSearch || mongoose.model('SavedSearch', savedSearchSchema);
