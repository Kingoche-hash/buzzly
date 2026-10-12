import mongoose from 'mongoose';

const { Schema } = mongoose;

// One person's PRIVATE settings for one conversation. Other members never see these.
const conversationStateSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    pinned: { type: Boolean, default: false },
    mutedUntil: { type: Date, default: null },
    spam: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    wallpaper: { type: String, default: 'default' },
    // When `wallpaper` is 'photo', this is the picture the person uploaded.
    wallpaperImage: {
      url: { type: String },
      publicId: { type: String },
    },
  },
  { timestamps: true }
);

// One settings card per person per chat.
conversationStateSchema.index({ user: 1, conversation: 1 }, { unique: true });

export default mongoose.model('ConversationState', conversationStateSchema);
