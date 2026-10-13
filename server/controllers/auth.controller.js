import {
  changeContact,
  forgotPassword,
  getAuthConfig,
  loginUser,
  registerUser,
  resendCode,
  resetPassword,
  verifyAccount,
} from '../services/auth.service.js';

export const getConfig = (req, res) => {
  res.status(200).json(getAuthConfig());
};

// A new account is NOT logged in yet: it must confirm the code first.
export const register = async (req, res) => {
  const result = await registerUser(req.body);
  res.status(201).json(result);
};

export const login = async (req, res) => {
  const result = await loginUser(req.body, req.ip);

  if (result.needsVerification) {
    return res.status(403).json({ message: 'Please confirm your account first.', ...result });
  }

  res.status(200).json({ user: result.user, token: result.token });
};

export const verify = async (req, res) => {
  const { user, token } = await verifyAccount(req.body);
  res.status(200).json({ user, token });
};

export const resend = async (req, res) => {
  await resendCode(req.body);
  res.status(200).json({ ok: true });
};

export const changeContactHandler = async (req, res) => {
  const result = await changeContact(req.body, req.ip);
  res.status(200).json(result);
};

export const forgot = async (req, res) => {
  await forgotPassword(req.body);
  res.status(200).json({ ok: true });
};

export const reset = async (req, res) => {
  await resetPassword(req.body);
  res.status(200).json({ ok: true });
};

export const getMe = (req, res) => {
  res.status(200).json({ user: req.user });
};
