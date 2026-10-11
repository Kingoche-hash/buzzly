import { registerUser, loginUser } from '../services/auth.service.js';

export const register = async (req, res) => {
  const { user, token } = await registerUser(req.body);
  res.status(201).json({ user, token });
};

export const login = async (req, res) => {
  const { user, token } = await loginUser(req.body, req.ip);
  res.status(200).json({ user, token });
};

export const getMe = (req, res) => {
  res.status(200).json({ user: req.user });
};
