import mongoose from 'mongoose';

const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    fileName: String,
    mimeType: String,
    size: Number,
  },
  { _id: false }
);

// What a reply to a story remembers about the story, because the story disappears after 24 hours.
const storyReplySchema = new Schema(
  {
    story: { type: Schema.Types.ObjectId, ref: 'Story' },
    type: { type: String, enum: ['text', 'image'] },
    text: { type: String, maxlength: 280, default: '' },
    background: { type: String, default: 'emerald' },
    imageUrl: { type: String, default: '' },
  },
  { _id: false }
);

// What a shared post remembers, because the post can be deleted later.
const sharedPostSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post' },
    imageUrl: { type: String, default: '' },
    imageCount: { type: Number, default: 1 },
    caption: { type: String, maxlength: 140, default: '' },
    authorName: { type: String, maxlength: 60, default: '' },
  },
  { _id: false }
);

// What a reply remembers about the message it answers (the original can be deleted later).
const replyToSchema = new Schema(
  {
    message: { type: Schema.Types.ObjectId, ref: 'Message' },
    sender: { type: Schema.Types.ObjectId, ref: 'User' },
    senderName: { type: String, maxlength: 60, default: '' },
    text: { type: String, maxlength: 140, default: '' },
    imageUrl: { type: String, default: '' },
  },
  { _id: false }
);

const reactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true, maxlength: 8 },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, trim: true, maxlength: 4000, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    storyReply: { type: storyReplySchema, default: undefined },
    sharedPost: { type: sharedPostSchema, default: undefined },
    replyTo: { type: replyToSchema, default: undefined },
    reactions: { type: [reactionSchema], default: [] },
    editedAt: { type: Date, default: null },
    // Set when the sender deletes the message for everyone. The message stays as an empty "tombstone".
    deletedAt: { type: Date, default: null },
    // People who deleted the message just for themselves.
    deletedFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    deliveredTo: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// Fast paging inside one conversation.
messageSchema.index({ conversation: 1, _id: -1 });

// Fast word search in message text. "none" means no language-specific guessing,
// so it works the same for English, Lithuanian and any other language.
messageSchema.index({ content: 'text' }, { default_language: 'none' });

// Who deleted a message just for themselves is private.
messageSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.deletedFor;
    delete ret.__v;
    return ret;
  },
});

// A new message brings a deleted chat back into everyone's list.
messageSchema.post('save', async function (message) {
  try {
    await mongoose
      .model('ConversationState')
      .updateMany(
        { conversation: message.conversation, deletedAt: { $ne: null } },
        { deletedAt: null }
      );
  } catch (error) {
    console.error('Could not restore deleted chats:', error.message);
  }
});

export default mongoose.model('Message', messageSchema);
