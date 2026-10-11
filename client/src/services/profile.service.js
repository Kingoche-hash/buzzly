import api from './api';
import { setToken } from './tokenStorage';

export const updateProfileRequest = async (patch) => {
  const res = await api.patch('/profile', patch);
  return res.data.user;
};

export const uploadAvatarRequest = async (file) => {
  const form = new FormData();
  form.append('avatar', file);

  const res = await api.post('/profile/avatar', form, { timeout: 60000 });
  return res.data.user;
};

export const removeAvatarRequest = async () => {
  const res = await api.delete('/profile/avatar');
  return res.data.user;
};

export const changePasswordRequest = async ({ currentPassword, newPassword }) => {
  const res = await api.post('/profile/password', { currentPassword, newPassword });

  // The old wristband stopped working with the old password. Keep the fresh one.
  if (res.data.token) setToken(res.data.token);
};

export const deleteAccountRequest = async (password) => {
  await api.delete('/profile', { data: { password } });
};

export const fetchUserProfile = async (userId) => {
  const res = await api.get(`/users/${userId}`);
  return res.data.user;
};
