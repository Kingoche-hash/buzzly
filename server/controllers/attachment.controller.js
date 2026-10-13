import { createMessage } from '../services/message.service.js';
import { deleteAttachments, uploadAttachments } from '../services/upload.service.js';
import { broadcastMessage } from '../socket/emitters.js';
import { AppError } from '../utils/AppError.js';

export const sendMessageWithFiles = async (req, res) => {
  const files = req.files || [];

  if (files.length === 0) {
    throw new AppError('Attach at least one file', 400);
  }

  const attachments = await uploadAttachments(files);

  try {
    const message = await createMessage({
      conversationId: req.params.conversationId,
      senderId: req.user._id,
      content: req.body.content ?? '',
      attachments,
      replyTo: req.valid?.query?.replyTo,
    });

    broadcastMessage(message);

    res.status(201).json({ message });
  } catch (error) {
    // The message could not be saved, so do not leave orphan files behind.
    await deleteAttachments(attachments);
    throw error;
  }
};
