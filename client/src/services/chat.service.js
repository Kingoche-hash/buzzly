import api from './api';

export const fetchConversations = async () => {
  const res = await api.get('/conversations');
  return res.data.conversations;
};

// Three ways to ask: the newest page, older ones (before), a window around one message (around),
// or newer ones (after).
export const fetchMessages = async (conversationId, { before, after, around, limit = 30 } = {}) => {
  const res = await api.get(`/conversations/${conversationId}/messages`, {
    params: { limit, before, after, around },
  });
  return res.data;
};

export const searchMessagesRequest = async ({ q, conversationId, senderId, before }) => {
  const res = await api.get('/search/messages', {
    params: { q, conversationId, senderId, before },
  });
  return res.data;
};

export const searchUsersRequest = async (search) => {
  const res = await api.get('/users', { params: { search } });
  return res.data.users;
};

export const startDirectConversation = async (userId) => {
  const res = await api.post('/conversations', { type: 'direct', userId });
  return res.data.conversation;
};

export const createGroupConversation = async ({ name, memberIds }) => {
  const res = await api.post('/conversations', { type: 'group', name, memberIds });
  return res.data.conversation;
};

// Changes MY private settings for a chat: { pinned, muted, spam, deleted, wallpaper }.
export const updateConversationStateRequest = async (conversationId, patch) => {
  const res = await api.patch(`/conversations/${conversationId}/state`, patch);
  return res.data.state;
};

// Sends files (and an optional caption) in one request. Reports upload progress as 0 to 100.
export const sendFilesRequest = async (conversationId, files, content, onProgress, replyTo) => {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  if (content) form.append('content', content);

  const res = await api.post(`/conversations/${conversationId}/attachments`, form, {
    timeout: 120000,
    params: replyTo ? { replyTo } : undefined,
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(Math.round((event.loaded * 100) / event.total));
    },
  });

  return res.data.message;
};
// Uses my own photo as the wallpaper of one chat.
export const setWallpaperPhotoRequest = async (conversationId, file) => {
  const form = new FormData();
  form.append('image', file);

  const res = await api.post(`/conversations/${conversationId}/wallpaper`, form, { timeout: 60000 });
  return res.data.state;
};

// Message tools: edit, delete (scope is 'me' or 'everyone'), react, report.
export const editMessageRequest = async (conversationId, messageId, content) => {
  const res = await api.patch(`/conversations/${conversationId}/messages/${messageId}`, { content });
  return res.data.message;
};

// Answers with the updated message for 'everyone', and with nothing for 'me'.
export const deleteMessageRequest = async (conversationId, messageId, scope) => {
  const res = await api.delete(`/conversations/${conversationId}/messages/${messageId}`, {
    params: { scope },
  });
  return res.data.message || null;
};

export const setReactionRequest = async (conversationId, messageId, emoji) => {
  const res = await api.put(`/conversations/${conversationId}/messages/${messageId}/reaction`, { emoji });
  return res.data.message;
};

export const removeReactionRequest = async (conversationId, messageId) => {
  const res = await api.delete(`/conversations/${conversationId}/messages/${messageId}/reaction`);
  return res.data.message;
};

export const reportMessageRequest = async (conversationId, messageId, reason) => {
  await api.post(`/conversations/${conversationId}/messages/${messageId}/report`, { reason });
};
