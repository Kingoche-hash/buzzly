import mongoose from 'mongoose';

const { Schema } = mongoose;

const viewerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    viewedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const storySchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image'], required: true },
    text: { type: String, trim: true, maxlength: 280, default: '' },
    background: { type: String, default: 'emerald' },
    image: {
      url: { type: String },
      publicId: { type: String },
    },
    viewers: { type: [viewerSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

storySchema.index({ author: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1 });

export default mongoose.model('Story', storySchema);