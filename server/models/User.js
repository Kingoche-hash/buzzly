import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    displayName: { type: String, trim: true, maxlength: 40, default: '' },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    passwordChangedAt: { type: Date, default: null },
    avatar: { type: String, default: '' },
    avatarPublicId: { type: String, default: '', select: false },
    bio: { type: String, trim: true, maxlength: 160, default: '' },
    status: { type: String, trim: true, maxlength: 60, default: 'Available' },
    privacy: {
      showPresence: { type: Boolean, default: true },
      readReceipts: { type: Boolean, default: true },
      typingIndicators: { type: Boolean, default: true },
    },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 12);

  // A new password signs out every session that started before it.
  if (!this.isNew) this.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.avatarPublicId;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
