import mongoose from 'mongoose';

const { Schema } = mongoose;

// One document per pair of people: either a pending request or an accepted friendship.
const friendshipSchema = new Schema(
  {
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // The two ids sorted and joined, so a pair can only exist once, whoever asked first.
    pairKey: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });

export default mongoose.model('Friendship', friendshipSchema);
