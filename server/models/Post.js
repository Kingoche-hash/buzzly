import mongoose from 'mongoose';

const { Schema } = mongoose;

const postSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    image: {
      url: { type: String, required: true },
      publicId: { type: String, default: '' },
      width: Number,
      height: Number,
    },
    caption: { type: String, trim: true, maxlength: 2000, default: '' },
    // Counters are kept on the post so the feed does not have to count anything.
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    // Becomes true when enough people report the post.
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The feed: newest first, hiding hidden posts.
postSchema.index({ hidden: 1, _id: -1 });
// One person's posts (their profile).
postSchema.index({ author: 1, hidden: 1, _id: -1 });

export default mongoose.model('Post', postSchema);
