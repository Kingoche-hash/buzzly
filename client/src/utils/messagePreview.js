import { isImage } from './attachments';

// The short line shown under a chat's name in the left list.
export const getMessagePreview = (message) => {
  if (!message) return 'No messages yet';
  if (message.deletedAt) return '🚫 This message was deleted';
  if (message.content) return message.content;
  if (message.sharedPost) return '📸 Shared a post';

  const attachments = message.attachments || [];

  if (attachments.length === 0) return 'No messages yet';

  if (attachments.every((attachment) => isImage(attachment.mimeType))) {
    return attachments.length === 1 ? '📷 Photo' : `📷 ${attachments.length} photos`;
  }

  return attachments.length === 1 ? `📎 ${attachments[0].fileName}` : `📎 ${attachments.length} files`;
};
