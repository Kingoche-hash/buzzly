import mongoose from 'mongoose';

const { Schema } = mongoose;

// One row per person and purpose: the CURRENT confirmation code. Sending a new code replaces it.
// Only a scrambled version (a hash) of the code is stored, never the code itself.
const otpCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['verify', 'reset'], required: true },
    channel: { type: String, enum: ['email', 'sms'], required: true },
    target: { type: String, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    // How many codes were sent in the current hour (to stop spamming).
    windowStart: { type: Date, required: true },
    windowCount: { type: Number, default: 1 },
  },
  { timestamps: true }
);

otpCodeSchema.index({ user: 1, purpose: 1 }, { unique: true });
// Rows disappear by themselves an hour after the code expired.
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default mongoose.model('OtpCode', otpCodeSchema);
