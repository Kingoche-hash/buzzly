import mongoose from 'mongoose';

const { Schema } = mongoose;

// "blocker has blocked blocked."
const blockSchema = new Schema(
  {
    blocker: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blocked: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One block per pair. Also makes "who did I block?" fast.
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
// "Who blocked me?"
blockSchema.index({ blocked: 1 });

export default mongoose.model('Block', blockSchema);
