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
    // People sign up with an email address OR a phone number, so each one is optional.
    // (The check below makes sure there is at least one.)
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    password: {
      type: String,
      required: true,
      select: false,
    },
    passwordChangedAt: { type: Date, default: null },
    // Who may start a chat with me: everyone, or only my friends.
    whoCanMessage: { type: String, enum: ['everyone', 'friends'], default: 'everyone' },
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
    // false until the person confirms their email or phone with a code.
    // Accounts made before this feature existed count as confirmed, so the default is true.
    verified: { type: Boolean, default: true },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.pre('validate', function () {
  if (!this.deletedAt && !this.email && !this.phone) {
    this.invalidate('email', 'An email address or a phone number is required');
  }
});

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
