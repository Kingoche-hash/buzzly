import mongoose from 'mongoose';

const { Schema } = mongoose;

const likeSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One like per person per post. Also makes "which of these posts did I like?" fast.
likeSchema.index({ user: 1, post: 1 }, { unique: true });
// Removing every like of a post.
likeSchema.index({ post: 1 });

export default mongoose.model('Like', likeSchema);
