import api from './api';

// Each of these answers with the updated group (the live update reaches everyone else).
export const renameGroupRequest = async (conversationId, name) =>
  (await api.patch(`/conversations/${conversationId}/group`, { name })).data.conversation;

export const uploadGroupAvatarRequest = async (conversationId, file) => {
  const form = new FormData();
  form.append('image', file);

  const res = await api.post(`/conversations/${conversationId}/group/avatar`, form, { timeout: 60000 });
  return res.data.conversation;
};

export const removeGroupAvatarRequest = async (conversationId) =>
  (await api.delete(`/conversations/${conversationId}/group/avatar`)).data.conversation;

export const addMembersRequest = async (conversationId, userIds) =>
  (await api.post(`/conversations/${conversationId}/members`, { userIds })).data.conversation;

export const removeMemberRequest = async (conversationId, userId) =>
  (await api.delete(`/conversations/${conversationId}/members/${userId}`)).data.conversation;

export const makeAdminRequest = async (conversationId, userId) =>
  (await api.put(`/conversations/${conversationId}/admins/${userId}`)).data.conversation;

export const removeAdminRequest = async (conversationId, userId) =>
  (await api.delete(`/conversations/${conversationId}/admins/${userId}`)).data.conversation;

export const leaveGroupRequest = async (conversationId) => {
  await api.post(`/conversations/${conversationId}/leave`);
};
