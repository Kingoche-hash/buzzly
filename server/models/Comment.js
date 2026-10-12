import mongoose from 'mongoose';

const { Schema } = mongoose;

const commentSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, trim: true, required: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The comments of one post, newest first.
commentSchema.index({ post: 1, _id: -1 });
commentSchema.index({ author: 1 });

export default mongoose.model('Comment', commentSchema);
