import mongoose from 'mongoose';

const { Schema } = mongoose;

const userReportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reported: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      enum: ['spam', 'harassment', 'fake_account', 'inappropriate', 'other'],
      required: true,
    },
    details: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One report per person per reported account.
userReportSchema.index({ reporter: 1, reported: 1 }, { unique: true });
userReportSchema.index({ reported: 1 });

export default mongoose.model('UserReport', userReportSchema);
