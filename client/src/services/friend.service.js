import api from './api';

// { friends, incoming, outgoing, settings: { whoCanMessage } }
export const fetchFriendsRequest = async () => (await api.get('/friends')).data;

// 'none', 'outgoing', 'incoming' or 'friends'.
export const fetchRelationshipRequest = async (userId) => (await api.get(`/friends/status/${userId}`)).data.status;

// Each of these answers with the new status.
export const sendFriendRequest = async (userId) => (await api.post(`/friends/requests/${userId}`)).data.status;
export const acceptFriendRequest = async (userId) =>
  (await api.post(`/friends/requests/${userId}/accept`)).data.status;
export const declineFriendRequest = async (userId) =>
  (await api.post(`/friends/requests/${userId}/decline`)).data.status;
export const cancelFriendRequest = async (userId) => (await api.delete(`/friends/requests/${userId}`)).data.status;
export const unfriendRequest = async (userId) => (await api.delete(`/friends/${userId}`)).data.status;

// 'everyone' or 'friends'.
export const updateMessageSettingRequest = async (whoCanMessage) =>
  (await api.patch('/friends/settings', { whoCanMessage })).data.whoCanMessage;
