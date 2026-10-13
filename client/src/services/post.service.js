import api from './api';

// The feed (everyone's posts), or one person's posts when userId is given.
// type: 'posts' or 'reposts' (for the two tabs of a profile).
export const fetchFeedRequest = async ({ before, userId, type, limit = 10 } = {}) => {
  const url = userId ? `/posts/user/${userId}` : '/posts';
  const res = await api.get(url, { params: { before, type, limit } });
  return res.data;
};

export const fetchPostRequest = async (postId) => (await api.get(`/posts/${postId}`)).data.post;

// { posts, reposts }: the numbers on a profile.
export const fetchPostSummaryRequest = async (userId) =>
  (await api.get(`/posts/user/${userId}/summary`)).data;

export const createPostRequest = async ({ files, caption, onProgress }) => {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));
  if (caption) form.append('caption', caption);

  const res = await api.post('/posts', form, {
    timeout: 180000,
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(Math.round((event.loaded * 100) / event.total));
    },
  });

  return res.data.post;
};

export const deletePostRequest = async (postId) => {
  await api.delete(`/posts/${postId}`);
};

export const likePostRequest = async (postId) => (await api.post(`/posts/${postId}/like`)).data;

export const unlikePostRequest = async (postId) => (await api.delete(`/posts/${postId}/like`)).data;

export const repostRequest = async (postId) => (await api.post(`/posts/${postId}/repost`)).data;

export const unrepostRequest = async (postId) => (await api.delete(`/posts/${postId}/repost`)).data;

// Sends the post to some chats: { conversationIds, text }.
export const sharePostRequest = async (postId, { conversationIds, text }) =>
  (await api.post(`/posts/${postId}/share`, { conversationIds, text })).data;

export const fetchCommentsRequest = async (postId, before) => {
  const res = await api.get(`/posts/${postId}/comments`, { params: { before } });
  return res.data;
};

export const addCommentRequest = async (postId, text) => {
  const res = await api.post(`/posts/${postId}/comments`, { text });
  return res.data.comment;
};

export const deleteCommentRequest = async (postId, commentId) => {
  await api.delete(`/posts/${postId}/comments/${commentId}`);
};

export const reportPostRequest = async (postId, reason) => {
  await api.post(`/posts/${postId}/report`, { reason });
};
