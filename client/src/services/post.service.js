import api from './api';

// The feed (everyone's posts), or one person's posts when userId is given.
export const fetchFeedRequest = async ({ before, userId } = {}) => {
  const url = userId ? `/posts/user/${userId}` : '/posts';
  const res = await api.get(url, { params: { before, limit: 10 } });
  return res.data;
};

export const createPostRequest = async ({ file, caption, onProgress }) => {
  const form = new FormData();
  form.append('image', file);
  if (caption) form.append('caption', caption);

  const res = await api.post('/posts', form, {
    timeout: 120000,
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
