import api from './api';

// What the register page needs to know (for example whether phone sign-up is on).
export const getAuthConfigRequest = async () => (await api.get('/auth/config')).data;

// A new account is not logged in yet: this answers { pending, identifier, channel, waitSeconds }.
export const registerRequest = async (data) => (await api.post('/auth/register', data)).data;

// data: { identifier (an email or a phone number), password }.
export const loginRequest = async (data) => (await api.post('/auth/login', data)).data;

// Confirms an account with the code. Answers { user, token }.
export const verifyRequest = async (data) => (await api.post('/auth/verify', data)).data;

export const resendRequest = async (identifier) => (await api.post('/auth/resend', { identifier })).data;

// Fixes a mistyped email or number: { identifier, password, email } or { identifier, password, phone }.
export const changeContactRequest = async (data) => (await api.post('/auth/change-contact', data)).data;

export const forgotRequest = async (identifier) => (await api.post('/auth/forgot', { identifier })).data;

export const resetRequest = async (data) => (await api.post('/auth/reset', data)).data;

export const getMeRequest = async () => {
  const res = await api.get('/auth/me');
  return res.data;
};
