import mongoose from 'mongoose';

const { Schema } = mongoose;

const messageReportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    reported: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: ['spam', 'harassment', 'inappropriate', 'other'], required: true },
    // A copy of the text at the time of the report, so editing or deleting it later cannot hide it.
    content: { type: String, maxlength: 300, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One report per person per message.
messageReportSchema.index({ reporter: 1, message: 1 }, { unique: true });
messageReportSchema.index({ reported: 1 });

export default mongoose.model('MessageReport', messageReportSchema);
