import api from './api';

// The people I blocked, newest first.
export const fetchBlockedRequest = async () => (await api.get('/blocks')).data.users;

export const blockUserRequest = async (userId) => {
  await api.post(`/blocks/${userId}`);
};

export const unblockUserRequest = async (userId) => {
  await api.delete(`/blocks/${userId}`);
};

// reason: spam, harassment, fake_account, inappropriate or other.
export const reportUserRequest = async (userId, { reason, details }) => {
  await api.post(`/users/${userId}/report`, { reason, details });
};
