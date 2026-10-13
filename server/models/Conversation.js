import mongoose from 'mongoose';

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 50, default: '' },
    type: { type: String, enum: ['direct', 'group'], required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // The people who run a group. Older groups have none: their creator counts as the admin.
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // A group's picture.
    avatar: { type: String, default: '' },
    avatarPublicId: { type: String, default: '', select: false },
    directKey: { type: String, unique: true, sparse: true },
    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ members: 1, lastMessageAt: -1 });

export default mongoose.model('Conversation', conversationSchema);
