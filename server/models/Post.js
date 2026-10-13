import mongoose from 'mongoose';

const { Schema } = mongoose;

const imageSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    width: Number,
    height: Number,
  },
  { _id: false }
);

const postSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // A post has one or more photos (up to 10).
    images: { type: [imageSchema], default: [] },
    // Posts made before multi-photo support kept a single picture here. We still read it.
    image: { url: String, publicId: String, width: Number, height: Number },
    caption: { type: String, trim: true, maxlength: 2000, default: '' },
    // A REPOST has no photos of its own: it points at the original post.
    isRepost: { type: Boolean, default: false },
    repostOf: { type: Schema.Types.ObjectId, ref: 'Post', default: null },
    // Counters are kept on the post so the feed does not have to count anything.
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    repostCount: { type: Number, default: 0, min: 0 },
    // Becomes true when enough people report the post.
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The feed: newest first, hiding hidden posts.
postSchema.index({ hidden: 1, _id: -1 });
// One person's posts (their profile).
postSchema.index({ author: 1, hidden: 1, _id: -1 });
// Finding the reposts of one post.
postSchema.index({ repostOf: 1 });
// One repost per person per post.
postSchema.index({ author: 1, repostOf: 1 }, { unique: true, partialFilterExpression: { isRepost: true } });

export default mongoose.model('Post', postSchema);
