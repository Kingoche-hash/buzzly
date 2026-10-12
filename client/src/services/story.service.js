import api from './api';

export const fetchStories = async () => {
  const res = await api.get('/stories');
  return res.data.groups;
};

export const createStoryRequest = async ({ file, text, background }) => {
  const form = new FormData();

  if (file) form.append('image', file);
  if (text) form.append('text', text);
  if (background) form.append('background', background);

  const res = await api.post('/stories', form, { timeout: 60000 });
  return res.data.story;
};

export const markStoryViewedRequest = async (storyId) => {
  await api.post(`/stories/${storyId}/view`);
};

export const fetchStoryViewers = async (storyId) => {
  const res = await api.get(`/stories/${storyId}/viewers`);
  return res.data.viewers;
};

export const deleteStoryRequest = async (storyId) => {
  await api.delete(`/stories/${storyId}`);
};

// Replies to someone's story. It arrives in your chat with them as a normal message.
export const replyToStoryRequest = async (storyId, content) => {
  const res = await api.post(`/stories/${storyId}/reply`, { content });
  return res.data.message;
};
