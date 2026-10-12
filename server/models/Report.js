import mongoose from 'mongoose';

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: ['spam', 'inappropriate', 'harassment', 'other'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One report per person per post.
reportSchema.index({ post: 1, reporter: 1 }, { unique: true });
reportSchema.index({ reporter: 1 });

export default mongoose.model('Report', reportSchema);
